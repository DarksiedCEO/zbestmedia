import type { AaliyahCrmAccount, AaliyahCrmContact, AaliyahCrmContextSummary, AaliyahCrmNote } from './crm-types.js';

const MAX_SUMMARY_NOTES = 3;

function relativeDate(value: string | null): string {
  if (!value) {
    return 'not yet recorded';
  }
  const deltaMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(deltaMs)) {
    return value;
  }
  const deltaDays = Math.floor(deltaMs / (24 * 60 * 60 * 1000));
  if (deltaDays <= 0) {
    return 'today';
  }
  if (deltaDays === 1) {
    return '1 day ago';
  }
  return `${deltaDays} days ago`;
}

export function buildAaliyahCrmSummary(args: {
  contact: AaliyahCrmContact | null;
  account: AaliyahCrmAccount | null;
  recentNotes: AaliyahCrmNote[];
}): AaliyahCrmContextSummary {
  const notes = [...args.recentNotes]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_SUMMARY_NOTES);

  const parts: string[] = [];
  if (args.contact) {
    const name = [args.contact.firstName, args.contact.lastName].filter(Boolean).join(' ').trim() || args.contact.email;
    parts.push(`${name} is in ${args.contact.relationshipStage} stage`);
  } else {
    parts.push('No CRM contact record exists yet');
  }

  if (args.account) {
    parts.push(`at ${args.account.name}`);
  }

  if (args.contact) {
    parts.push(`Last touched ${relativeDate(args.contact.lastTouchedAt)}.`);
    parts.push(
      args.contact.nextActionAt
        ? `Next action scheduled ${new Date(args.contact.nextActionAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
        : 'No next action is scheduled.'
    );
  }

  if (notes[0]) {
    parts.push(`Recent note: ${notes[0].note}`);
  }

  return {
    contact: args.contact,
    account: args.account,
    recentNotes: notes,
    summary: parts.join(' ').replace(/\s+/g, ' ').trim()
  };
}
