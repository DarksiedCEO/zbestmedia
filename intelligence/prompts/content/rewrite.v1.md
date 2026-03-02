# Prompt: content.rewrite.v1
Purpose: Rewrite content into platform-specific variants while preserving brand constraints.

Output MUST be valid JSON matching schema:
- intelligence/prompts/schemas/content.rewrite.output.schema.json

INPUT (JSON):
{{input_json}}

Rules:
- Generate 3 variants.
- Each variant must be materially different (hook, rhythm, CTA).
- Respect maxChars.
- Return ONLY JSON.
