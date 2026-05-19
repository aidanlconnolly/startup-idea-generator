import os
import json
from flask import Flask, request, Response, send_from_directory
import anthropic

app = Flask(__name__, static_folder='.', static_url_path='')
client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

MODEL = 'claude-sonnet-4-6'


def build_prompt(data):
    domain = (data.get('domain') or 'random').strip()
    problem_type = (data.get('problemType') or 'random').strip()
    context = (data.get('context') or '').strip()

    is_random = domain == 'random' and problem_type == 'random'

    if is_random:
        framing = (
            "Generate 5 startup ideas spanning a diverse mix of domains "
            "(pick varied spaces — do not cluster them in one industry) and a "
            "mix of problem framings (niche pain point, mass market, underserved demographic)."
        )
    else:
        domain_label = domain if domain != 'random' else 'any domain you choose'
        problem_label = problem_type if problem_type != 'random' else 'any framing you choose'
        framing = (
            f"Generate 5 startup ideas in the **{domain_label}** space, framed as "
            f"**{problem_label}** opportunities. Make the 5 ideas meaningfully different from each other."
        )

    extra = f"\n\nFounder context to weigh: {context}" if context else ""

    return f"""You are a sharp startup analyst helping a founder identify validated startup ideas.

{framing}{extra}

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

Tone: calm, specific, honest. No buzzwords, no hype. Each idea should feel investable, not generic. Company names should be punchy and made up."""


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/ideas', methods=['POST'])
def ideas():
    data = request.get_json()
    prompt = build_prompt(data)

    def generate():
        with client.messages.stream(
            model=MODEL,
            max_tokens=5000,
            messages=[{'role': 'user', 'content': prompt}]
        ) as stream:
            for text in stream.text_stream:
                yield f'data: {json.dumps(text)}\n\n'
        yield 'data: [DONE]\n\n'

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


if __name__ == '__main__':
    app.run(port=5051, debug=False)
