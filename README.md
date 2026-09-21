# AgriGuard — Local Setup

This runs the prototype with a **real, working AI call**, on your own laptop.

## Why this structure?
Calling an AI model directly from a browser file isn't possible without exposing
your API key to anyone who views the page source — browsers block it for exactly
this reason. So this project has two small pieces:
- `public/crop-advisory-prototype.html` — the app you interact with
- `server.js` — a tiny local server that holds your API key privately and
  forwards requests to the AI on your behalf

## Setup (one-time)

1. Install Node.js if you don't have it: https://nodejs.org (LTS version)
2. Get a free Anthropic API key: https://console.anthropic.com/settings/keys
   (sign up gives you a small amount of free credit — plenty for a demo)
3. Open a terminal in this folder and run:
   ```
   npm install
   ```

## Run it

Set your API key and start the server (pick the line for your OS):

**Mac/Linux:**
```
export ANTHROPIC_API_KEY=your-key-here
npm start
```

**Windows (PowerShell):**
```
$env:ANTHROPIC_API_KEY="your-key-here"
npm start
```

Then open: **http://localhost:3000/crop-advisory-prototype.html**

## Live weather
The "Fetch live weather" button calls Open-Meteo (free, no key needed) — it
should work as soon as the page loads, even before you set up the API key.
If it fails, open your browser's DevTools (F12) → Console tab and check the
exact error message.

## If you don't want to get an API key right now
The app still works without one — every advisory just falls back to the
pre-written guidance text instead of a freshly generated one, and the retrieval
+ risk-scoring logic (the "agent" part) still runs exactly the same either way.
