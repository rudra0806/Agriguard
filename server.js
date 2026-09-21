const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY?.trim();

async function callGemini({ system, prompt, maxTokens = 1000 }) {
  if (!API_KEY) {
    const err = new Error("Server is missing GEMINI_API_KEY. Add it to .env and restart the server.");
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini API error");
    error.status = response.status;
    throw error;
  }

  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no text content.");
  return text;
}

async function getEmbedding(text, taskType) {
  if (!API_KEY) throw new Error("MISSING_API_KEY");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: {
        parts: [{ text }]
      },
      taskType
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API error: ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

function parseJsonObject(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI response was not valid JSON.");
  }
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

app.post("/api/semantic-retrieve", async (req, res) => {
  const { crop, symptom, weather, documents } = req.body;

  if (!crop || !Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: "Missing crop or documents." });
  }

const cropNames = [...new Set(
  documents.map(d => String(d.crop).toLowerCase())
)];

const mentionedCrops = cropNames.filter(name =>
  String(symptom || "").toLowerCase().includes(name)
);

if (
  mentionedCrops.length > 0 &&
  !mentionedCrops.includes(String(crop).toLowerCase())
) {
  console.log(`Crop mismatch: selected=${crop}, mentioned=${mentionedCrops.join(", ")}`);

  return res.json({
    candidates: [],
    noMatch: true,
    reason: "The symptoms explicitly mention a different crop.",
    model: "gemini-embedding-001"
  });
}

  try {
    const queryText = `
Crop: ${crop}
Symptoms: ${symptom || "none reported"}
Weather: ${weather?.temp ?? "unknown"}°C,
${weather?.humidity ?? "unknown"}% RH,
${weather?.rainfall ?? "unknown"} mm rainfall
`;

    const queryEmbedding = await getEmbedding(
      queryText,
      "RETRIEVAL_QUERY"
    );

    const results = [];

    for (const doc of documents) {
      const docText = `
Crop: ${doc.crop}
Title: ${doc.title}
Source: ${doc.source}
Guidance: ${doc.action}
Favorable conditions: ${JSON.stringify(doc.favorable)}
`;

      const docEmbedding = await getEmbedding(
        docText,
        "RETRIEVAL_DOCUMENT"
      );

      const similarity = cosineSimilarity(
        queryEmbedding,
        docEmbedding
      );

      results.push({
        ...doc,
        similarity
      });
    }

    const filtered = results
  .filter(doc => doc.crop === crop)
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 4);

const bestSimilarity = filtered[0]?.similarity || 0;

console.log(
  `Semantic match: ${filtered[0]?.title || "none"} | score: ${bestSimilarity.toFixed(4)}`
);

if (bestSimilarity < 0.72) {
  return res.json({
    candidates: [],
    noMatch: true,
    bestSimilarity,
    model: "gemini-embedding-001"
  });
}

res.json({
  candidates: filtered,
  noMatch: false,
  bestSimilarity,
  model: "gemini-embedding-001"
});

  } catch (err) {
    console.error("Semantic retrieval error:", err);
    res.status(err.status || 500).json({
      error: err.message
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, apiConfigured: Boolean(API_KEY), model: MODEL });
});

// Stage 2 of RAG: Gemini ranks the small, auditable candidate set supplied by the browser.
app.post("/api/rank", async (req, res) => {
  const { crop, symptom, weather, candidates } = req.body;
  if (!crop || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: "Missing crop or candidate documents." });
  }

  const candidatePayload = candidates.map((c, index) => ({
    id: index + 1,
    title: c.title,
    source: c.source,
    guidance: c.action,
    risk_conditions: c.favorable,
    similarity: c.similarity
  }));

  const system = `You are the retrieval-ranking component of AgriGuard, an agricultural advisory RAG system.
Rank ONLY the supplied candidate documents using the farmer's symptoms, weather, and semantic similarity score.
Do not invent documents, diseases, treatments, pesticide doses, or facts.
Weather compatibility is supporting evidence, not proof of diagnosis.
Semantic similarity is retrieval evidence, not proof of diagnosis. A high similarity score alone must not be treated as a confirmed disease match.
If the farmer's symptoms explicitly mention a different crop than the selected crop, return selected_id as null.
Return ONLY valid JSON in this exact shape:
{"selected_id":1,"ranked":[{"id":1,"relevance":0.0,"reason":"short evidence-based reason"}],"confidence":0.0}
Use relevance and confidence between 0 and 1. Rank every candidate. Select the best-supported candidate only if the evidence meaningfully matches the farmer's symptoms. If none of the candidates is a meaningful match, return selected_id as null, confidence below 0.5, and explain that the available evidence does not sufficiently match the reported symptoms.`;

  const prompt = `Farmer crop: ${crop}
Farmer symptoms: ${symptom || "none reported"}
Weather: ${weather?.temp ?? "unknown"}°C, ${weather?.humidity ?? "unknown"}% RH, ${weather?.rainfall ?? "unknown"} mm rainfall

Candidate documents:
${JSON.stringify(candidatePayload, null, 2)}

Select the single best-supported candidate and explain each ranking briefly using only the supplied evidence.`;

  try {
    console.log("Rank request → Gemini started");
    const ranking = parseJsonObject(await callGemini({ system, prompt, maxTokens: 900 }));
    console.log("Rank request → Gemini finished");

    const validIds = new Set(candidatePayload.map(c => c.id));
if ((ranking.selected_id !== null && !validIds.has(Number(ranking.selected_id))) || !Array.isArray(ranking.ranked)) {
  throw new Error("AI ranker returned an invalid candidate selection.");
}

    ranking.selected_id =
     ranking.selected_id === null ? null : Number(ranking.selected_id);
    ranking.confidence = Math.max(0, Math.min(1, Number(ranking.confidence) || 0));
    ranking.ranked = ranking.ranked.filter(i => validIds.has(Number(i.id))).map(i => ({
      id: Number(i.id), relevance: Math.max(0, Math.min(1, Number(i.relevance) || 0)), reason: String(i.reason || "")
    }));
    res.json({ ...ranking, model: MODEL });
  } catch (err) {
    res.status(err.code === "MISSING_API_KEY" ? 503 : (err.status || 500)).json({ error: err.message });
  }
});

// Stage 3 of RAG: generate the final farmer-facing advisory from the selected evidence only.
app.post("/api/advisory", async (req, res) => {
  const { crop, symptom, weather, selectedDocument, risk, confidence } = req.body;
  if (!selectedDocument) return res.status(400).json({ error: "Missing selected retrieved document." });

  const system = `You are AgriGuard's grounded agricultural advisory generator.
Use ONLY the selected retrieved document and supplied weather/context.
Do not invent facts, diagnoses, pesticide doses, treatments, or sources.
Return ONLY valid JSON:
{"summary":"one short farmer-friendly risk explanation","actions":["action 1","action 2"],"caution":"one short safety/uncertainty note"}
Actions must be direct restatements or concise splits of the supplied guidance, not new recommendations.
State that the result is a risk indication, not a confirmed diagnosis.`;

  const prompt = `Crop: ${crop}
Symptoms: ${symptom || "none reported"}
Weather: ${weather?.temp ?? "unknown"}°C, ${weather?.humidity ?? "unknown"}% RH, ${weather?.rainfall ?? "unknown"} mm rainfall
Risk level: ${risk || "unknown"}
AI retrieval confidence: ${confidence ?? "unknown"}

Selected retrieved document:
Title: ${selectedDocument.title}
Source: ${selectedDocument.source}
Guidance: ${selectedDocument.action}`;

  try {
    const advisory = parseJsonObject(await callGemini({ system, prompt, maxTokens: 800 }));
    advisory.actions = Array.isArray(advisory.actions) ? advisory.actions.map(String).filter(Boolean).slice(0, 4) : [];
    advisory.summary = String(advisory.summary || "");
    advisory.caution = String(advisory.caution || "This is a risk indication, not a confirmed diagnosis.");
    res.json({ ...advisory, model: MODEL });
  } catch (err) {
    res.status(err.code === "MISSING_API_KEY" ? 503 : (err.status || 500)).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgriGuard local server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/crop-advisory-prototype.html in your browser.`);
  console.log(`Gemini model: ${MODEL}`);
  console.log(`Gemini API key: ${API_KEY ? "configured" : "NOT configured (fallback mode)"}`);
});
