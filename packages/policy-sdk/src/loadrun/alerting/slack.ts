export async function sendSlackAlert(args: { webhookUrl: string; text: string }): Promise<void> {
  const res = await fetch(args.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: args.text })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`slack_alert_failed status=${res.status} body=${body}`);
  }
}
