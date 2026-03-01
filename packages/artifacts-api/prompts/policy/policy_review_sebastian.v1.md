# Policy Review Sebastian v1

Output JSON only:
{
  "decision": "approved|rejected",
  "notes": "string",
  "required_roles_check": {
    "sebastian": true,
    "finance": true,
    "legal": true,
    "ceo": true
  }
}

Constraints:
- decision must be rejected when hard invariants are breached.
- notes must be concise and specific to risk/operations impact.
