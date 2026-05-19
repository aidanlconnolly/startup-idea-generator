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
    exec_mode = (data.get('execMode') or 'any').strip()
    ai_mode = (data.get('aiMode') or 'any').strip()
    context = (data.get('context') or '').strip()
    exclude_titles = data.get('excludeTitles') or []

    is_random = domain == 'random' and problem_type == 'random'

    if is_random:
        framing = (
            "Generate 4 startup ideas spanning a diverse mix of domains and problem framings. "
            "Make each idea feel meaningfully different from the others."
        )
    else:
        domain_label = domain if domain != 'random' else 'any domain you choose'
        problem_label = problem_type if problem_type != 'random' else 'any framing you choose'
        framing = (
            f"Generate 4 startup ideas in the **{domain_label}** space, "
            f"framed as **{problem_label}** opportunities. Make each idea meaningfully different."
        )

    constraints = []
    if exec_mode == 'Remote-first':
        constraints.append("All ideas must be fully online / remote-first — no field work or physical operations required.")
    elif exec_mode == 'Requires field work':
        constraints.append("All ideas should involve a physical or in-person component.")
    if ai_mode == 'AI-powered':
        constraints.append("All ideas must have AI/ML as a core part of the product, not just a feature.")
    elif ai_mode == 'No AI':
        constraints.append("Do not use AI as a core component. Traditional SaaS, marketplaces, or services only.")

    constraint_block = ('\n\nConstraints:\n' + '\n'.join(f'- {c}' for c in constraints)) if constraints else ''
    context_block = f"\n\nFounder context: {context}" if context else ''
    exclude_block = ''
    if exclude_titles:
        exclude_block = '\n\nDo NOT generate ideas similar to these already-saved ones:\n' + '\n'.join(f'- {t}' for t in exclude_titles[:20])

    return f"""You are a sharp startup analyst helping a founder identify validated startup ideas.

{framing}{constraint_block}{context_block}{exclude_block}

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

Tone: calm, specific, honest. No buzzwords. Each idea should feel investable and distinct."""


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
