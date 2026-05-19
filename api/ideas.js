import Anthropic from '@anthropic-ai/sdk';

export const config = { runtime: 'edge' };

const MODEL = 'claude-sonnet-4-6';

function buildPrompt(data) {
  const domain = (data.domain || 'random').trim();
  const problemType = (data.problemType || 'random').trim();
  const execMode = (data.execMode || 'any').trim();
  const aiMode = (data.aiMode || 'any').trim();
  const context = (data.context || '').trim();
  const excludeTitles = data.excludeTitles || [];

  const isRandom = domain === 'random' && problemType === 'random';

  let framing;
  if (isRandom) {
    framing = 'Generate 4 startup ideas spanning a diverse mix of domains and problem framings. Make each idea feel meaningfully different from the others.';
  } else {
    const domainLabel = domain === 'random' ? 'any domain you choose' : domain;
    const problemLabel = problemType === 'random' ? 'any framing you choose' : problemType;
    framing = `Generate 4 startup ideas in the **${domainLabel}** space, framed as **${problemLabel}** opportunities. Make each idea meaningfully different.`;
  }

  const constraints = [];
  if (execMode === 'Remote-first') constraints.push('All ideas must be fully online / remote-first — no field work or physical operations required.');
  if (execMode === 'Requires field work') constraints.push('All ideas should involve a physical or in-person component.');
  if (aiMode === 'AI-powered') constraints.push('All ideas must have AI/ML as a core part of the product, not just a feature.');
  if (aiMode === 'No AI') constraints.push('Do not use AI as a core component. Traditional SaaS, marketplaces, or services only.');

  const constraintBlock = constraints.length ? '\n\nConstraints:\n' + constraints.map(c => `- ${c}`).join('\n') : '';
  const contextBlock = context ? `\n\nFounder context: ${context}` : '';
  const excludeBlock = excludeTitles.length
    ? '\n\nDo NOT generate ideas similar to these already-saved ones:\n' + excludeTitles.slice(0, 20).map(t => `- ${t}`).join('\n')
    : '';

  return `You are a sharp startup analyst helping a founder identify validated startup ideas.

${framing}${constraintBlock}${contextBlock}${excludeBlock}

Start directly with Idea #1 — no preamble.

For each of the 4 ideas, use EXACTLY this markdown format:

## [Descriptive Title — what it does and who it's for]
Example format: "Automated Lease Abstraction for Commercial Real Estate Teams" or "Peer Coaching Marketplace for First-Generation College Students"

**Problem**
[2 sentences on the concrete pain and who feels it most acutely.]

**Target customer**
[1–2 sentences: specific buyer or user segment, job title, company size if B2B.]

**Why now**
[2 sentences: the regulatory, technological, or behavioral shift making this viable today.]

**Rough TAM**
[Specific dollar figure with one line of derivation, e.g. "$4B — 20M US freelancers × ~$200/yr".]

**Competitors & differentiation**
1. [Competitor] — [why this wins or differs]
2. [Competitor] — [why this wins or differs]
3. [Competitor] — [why this wins or differs]

**Hardest thing to get right**
[2 sentences on the single biggest execution risk.]

**Name ideas**
[3–4 punchy, made-up brand name options, comma-separated]

---

[repeat for ideas 2–4]

Tone: calm, specific, honest. No buzzwords. Each idea should feel investable and distinct.`;
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
