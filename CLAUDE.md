# CLAUDE.md

## Running locally

```bash
pip3 install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python3 server.py
# open http://localhost:5051
```

## Deploying to Vercel

Push to `main`; Vercel auto-deploys. Set `ANTHROPIC_API_KEY` in Project Settings → Environment Variables.

## Architecture

Dual-target, mirrors Dream Career Picker:

- **Local**: `server.py` — Flask on port 5051. Streams Claude SSE at `POST /api/ideas`.
- **Vercel**: `api/ideas.js` — Edge function, same contract. Static `public/index.html`.
- **Frontend**: single-file SPA, no build step.

**`index.html` and `public/index.html` must stay byte-identical** — keep both in sync when editing the UI.

**Prompt parity**: `server.py:build_prompt()` and `api/ideas.js:buildPrompt()` must produce equivalent prompts. Update both together.

## Persistence

All saved ideas live in `localStorage` under `sig.savedIdeas`. No server storage — works identically locally and on Vercel.

## Streaming protocol

SSE: `data: "<json-text>"\n\n`, terminated by `data: [DONE]\n\n`. Frontend reads via `fetch` + `ReadableStream` (not `EventSource`, because POST).

The frontend splits the stream on `\n## ` to render each idea card as soon as its heading arrives.
