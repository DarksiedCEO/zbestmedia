# Prompt: governance.riskcheck.v2
Purpose: Identify compliance and reputation risks using a policy pack and taxonomy.

Output MUST match schema:
- intelligence/prompts/schemas/governance.riskcheck.output.v2.schema.json

INPUT (JSON):
{{input_json}}

Rules:
- Use policyPackId rules.
- Every flag must include riskCode and severity.
- Provide safeAlternatives that preserve intent.
- Return ONLY JSON.
