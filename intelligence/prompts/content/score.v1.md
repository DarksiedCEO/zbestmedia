# Prompt: content.score.v1
Purpose: Score content quality for a specific platform and target brand context.

Output MUST be valid JSON matching schema:
- intelligence/prompts/schemas/content.score.output.schema.json

Rules:
- Score 0..100.
- Provide numeric signals (0..1 typical scale, but any number allowed).
- Warnings are actionable, not generic.
- Recommendations are specific edits or rewrites.

INPUT (JSON):
{{input_json}}

Return ONLY JSON. No prose.
