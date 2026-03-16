import type { AaliyahCrmAccount, AaliyahCrmContact } from './crm-types.js';
import type { AaliyahTask } from './tasks-types.js';

function formatDueDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildLinkedEntity(contact: AaliyahCrmContact | null, account: AaliyahCrmAccount | null): string | null {
  if (contact) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email;
    if (account) {
      return `${name} at ${account.name}`;
    }
    return name;
  }
  if (account) {
    return account.name;
  }
  return null;
}

export function buildAaliyahTaskNextStepSummary(args: {
  task: Pick<AaliyahTask, 'title' | 'status' | 'priority' | 'dueAt' | 'blockedReason' | 'completionNote' | 'description'>;
  contact: AaliyahCrmContact | null;
  account: AaliyahCrmAccount | null;
}): string {
  const parts: string[] = [];
  parts.push(`Task is ${args.task.status.replace('_', ' ')}, ${args.task.priority} priority.`);

  const linkedEntity = buildLinkedEntity(args.contact, args.account);
  if (linkedEntity) {
    parts.push(`Linked to ${linkedEntity}.`);
  }

  const due = formatDueDate(args.task.dueAt);
  if (due) {
    parts.push(`Due ${due}.`);
  }

  if (args.task.status === 'blocked' && args.task.blockedReason) {
    parts.push(`Blocked because ${args.task.blockedReason}.`);
  } else if (args.task.status === 'completed') {
    parts.push(args.task.completionNote ? `Completed: ${args.task.completionNote}.` : 'Completed and closed.');
  } else if (args.task.description) {
    parts.push(`Next step: ${args.task.description}.`);
  } else {
    parts.push(`Next step: ${args.task.title}.`);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
