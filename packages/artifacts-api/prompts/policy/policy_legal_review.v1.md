# Policy Legal Review v1

Output JSON only:
{
  "legal_ok": true,
  "risks": ["string"],
  "recommendation": "approved|rejected"
}

Constraints:
- recommendation must be rejected if compliance tolerance > 0 or unverified claims are allowed.
- risks must be specific and actionable.
