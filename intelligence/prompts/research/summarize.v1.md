# Prompt: research.summarize.v1
Purpose: Convert evidence + timeline into findings + a dossier-ready summary.

Output MUST be valid JSON matching schema:
- intelligence/prompts/schemas/research.summarize.output.schema.json

INPUT (JSON):
{{input_json}}

Rules:
- Provide 5 findings max.
- Each finding must cite evidence IDs.
- Keep language enterprise-neutral, no hype.
- Return ONLY JSON.
