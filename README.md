# 🌱 AgriGuard — AI-Powered Climate-Resilient Crop Risk Advisory System

AgriGuard is an AI-powered crop risk advisory system designed to help farmers understand potential crop risks using **Semantic Retrieval-Augmented Generation (RAG)**, agricultural evidence, and live weather conditions.

The system combines farmer-reported symptoms with crop-specific agricultural knowledge and current weather information to provide a clear, evidence-based risk indication.

> ⚠️ AgriGuard provides a risk indication and advisory based on available evidence. It is not a confirmed agricultural diagnosis.

---

## 🎯 Problem Statement

Small and marginal farmers can face crop losses due to pests, diseases, and changing weather conditions.

Generic agricultural advice may not always match the crop, symptoms, or local environmental conditions observed by a farmer.

AgriGuard addresses this by combining:

- Crop-specific agricultural evidence
- Semantic similarity-based retrieval
- Live weather information
- AI-generated grounded advisory
- Transparent evidence tracing

---

## 💡 Solution

The farmer provides:

- Crop name
- Location
- Observed symptoms

AgriGuard then:

1. Converts the farmer's query into a semantic representation.
2. Retrieves relevant crop-specific agricultural evidence.
3. Calculates semantic similarity between the symptoms and available evidence.
4. Fetches live weather conditions.
5. Combines evidence similarity, baseline severity, and weather compatibility to determine a risk level.
6. Generates a grounded advisory using the selected agricultural evidence.
7. Displays an evidence trace explaining why the result was selected.

---

## 🤖 AI & RAG Architecture

```text
Farmer Input
     │
     ├── Crop
     ├── Location
     └── Symptoms
          │
          ▼
   Semantic Retrieval
          │
          ▼
   Gemini Embeddings
          │
          ▼
Crop-Specific Evidence
          │
          ├──────────────► Semantic Similarity
          │
          ▼
    Live Weather Data
     (Open-Meteo)
          │
          ▼
   Risk Assessment
          │
          ▼
   Grounded AI Advisory
     (Gemini 2.5 Flash)
          │
          ▼
 Evidence Trace + Advisory