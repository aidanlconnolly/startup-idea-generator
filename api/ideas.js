import Anthropic from '@anthropic-ai/sdk';

export const config = { runtime: 'edge' };

const MODEL = 'claude-sonnet-4-20250514';

function buildPrompt(data) {
  const domain = (data.domain || 'random').trim();
  const problemType = (data.problemType || 'random').trim();
  const context = (data.context || '').trim();

  const isRandom = domain === 'random' && problemType === 'random';

  let framing;
  if (isRandom) {
    framing =
      'Generate 5 startup ideas spanning a diverse mix of domains ' +
      '(pick varied spaces — do not cluster them in one industry) and a ' +
      'mix of problem framings (niche pain point, mass market, underserved demographic).';
  } else {
    const domainLabel = domain === 'random' ? 'any domain you choose' : domain;
    const problemLabel = problemType === 'random' ? 'any framing you choose' : problemType;
    framing = `Generate 5 startup ideas in the **${domainLabel}** space, framed as **${problemLabel}** opportunities. Make the 5 ideas meaningfully different from each other.`;
  }

  const extra = context ? `\n\nFounder context to weigh: ${context}` : '';

  return `You are a sharp startup analyst helping a founder identify validated startup ideas.

${framing}${extra}

Start directly with Idea #1 — no preamble, no introductory text.

For each of the 5 ideas, use EXACTLY this markdown format:

## [Company Name]

**One-line pitch**
[A single punchy sentence. No filler.]

**Problem**
[2 sentences on the concrete pain being solved and who feels it most acutely.]

**Target customer**
[1–2 sentences naming the specific buyer / user segment.]

**Why now**
[2 sentences on the market timing — regulatory, technological, behavioral shift that makes this viable today.]

**Rough TAM**
[A specific dollar figure with 1 line of derivation, e.g. "$8B — 40M US SMBs × ~$200/yr ARPU".]

**Competitors & differentiation**
1. [Competitor name] — [why this idea wins or differs]
2. [Competitor name] — [why this idea wins or differs]
3. [Competitor name] — [why this idea wins or differs]

**Hardest thing to get right**
[2 sentences naming the single biggest execution risk — distribution, technical, regulatory, or trust.]

---

[repeat exactly for ideas 2–5]

Tone: calm, specific, honest. No buzzwords, no hype. Each idea should feel investable, not generic. Company names should be punchy and made up.`;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const data = await req.json();
  const prompt = buildPrompt(data);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = await client.messages.stream({
          model: MODEL,
          max_tokens: 5000,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of msgStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.delta.text)}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify('[ERROR] ' + err.message)}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
