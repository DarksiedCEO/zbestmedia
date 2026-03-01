export async function sendEmailAlert(args: {
  webhookUrl: string;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const res = await fetch(args.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: args.to, subject: args.subject, body: args.body })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`email_alert_failed status=${res.status} body=${body}`);
  }
}
