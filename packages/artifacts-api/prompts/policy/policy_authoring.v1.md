# Policy Authoring v1

Output must be valid JSON only (no markdown, no prose) matching:
{
  "scopeType": "global|client|campaign",
  "scopeId": "uuid|null",
  "clientId": "uuid|null",
  "policyKey": "performance_limits|creative_limits|sales_limits|finance_limits",
  "valueJson": {},
  "effectiveAt": "ISO-8601 datetime",
  "expiresAt": "ISO-8601 datetime|null",
  "changeReason": "string",
  "requiredRoles": ["sebastian","finance","legal","ceo"]
}

Rules:
- campaign scope requires scopeId, clientId, expiresAt.
- global scope requires scopeId=null and clientId=null.
- requiredRoles must include all governance reviewers needed for the policy type.
- Do not output fields outside this schema.
