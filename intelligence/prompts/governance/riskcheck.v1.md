# Prompt: governance.riskcheck.v1
Purpose: Identify compliance/reputation risks in draft content and propose safer alternatives.

Output MUST be valid JSON matching schema:
- intelligence/prompts/schemas/governance.riskcheck.output.schema.json

INPUT (JSON):
{{input_json}}

Rules:
- Flag specific risky phrases.
- Offer safe alternatives that preserve intent.
- Do not provide legal advice; keep it operational.
- Return ONLY JSON.
