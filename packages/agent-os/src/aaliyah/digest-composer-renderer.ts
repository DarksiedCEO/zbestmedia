export function renderDigestHtml(args: { title: string; summary: string; bodyText: string }) {
  const escapedTitle = escapeHtml(args.title);
  const escapedSummary = escapeHtml(args.summary);
  const paragraphs = args.bodyText
    .split('\n\n')
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
  return `<h1>${escapedTitle}</h1><p>${escapedSummary}</p>${paragraphs}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
