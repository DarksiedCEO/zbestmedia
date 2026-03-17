import type { FounderBriefHeadlineCounts } from './founder-brief-types.js';

export function buildFounderBriefHeadline(counts: FounderBriefHeadlineCounts) {
  const parts: string[] = [];
  parts.push(`${counts.immediateActions} immediate action${counts.immediateActions === 1 ? '' : 's'}`);
  parts.push(`${counts.resolved} resolved`);
  parts.push(`${counts.reopenedOrPersisting} reopened or persisting`);
  parts.push(`${counts.opportunities} opportunit${counts.opportunities === 1 ? 'y' : 'ies'} worth review`);
  return parts.join(', ');
}

export function buildFounderBriefMessage(args: { replayed: boolean; itemCount: number; headline: string }) {
  if (args.replayed) {
    return `Replayed founder brief snapshot. ${args.headline}`;
  }
  if (args.itemCount === 0) {
    return `Generated a quiet founder brief. ${args.headline}`;
  }
  return `Generated founder brief with ${args.itemCount} item${args.itemCount === 1 ? '' : 's'}. ${args.headline}`;
}
