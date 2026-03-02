# Prompt: governance.safeRewrite.v1
Purpose: Rewrite content safely given risk flags and a policy pack.

Output MUST match schema:
- intelligence/prompts/schemas/governance.safeRewrite.output.v1.schema.json

INPUT (JSON):
{{input_json}}

Rules:
- Generate 2 rewrites.
- Each rewrite must preserve business intent.
- Each rewrite must explain which riskCodes it mitigates.
- Return ONLY JSON.
