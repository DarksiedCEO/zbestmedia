# Policy Finance Review v1

Output JSON only:
{
  "margin_ok": true,
  "concerns": ["string"],
  "recommendation": "approved|rejected"
}

Constraints:
- recommendation must be rejected if any margin floor is below 0.25.
- concerns must reference concrete numeric thresholds.
