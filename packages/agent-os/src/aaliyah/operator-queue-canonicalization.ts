import type { OperatorQueueActionableCommandType, OperatorQueueComparableRecord, OperatorQueueRecord } from './operator-queue-types.js';

export function buildCanonicalIssueKey(args: {
  sourceType: string;
  sourceId: string;
  clusterKey?: string | null;
  actionableCommandType?: OperatorQueueActionableCommandType | null;
  metadata?: Record<string, unknown>;
  relatedRecordIds?: string[];
}) {
  const metadata = args.metadata ?? {};
  const entity = firstString([
    stringValue(metadata.accountId),
    stringValue(metadata.contactId),
    stringValue(metadata.taskId),
    stringValue(metadata.relatedClusterId),
    args.clusterKey,
    firstDeterministicEntity(args.relatedRecordIds ?? []),
    `${args.sourceType}:${args.sourceId}`
  ]);
  const issueClass = firstString([
    stringValue(metadata.escalationType),
    stringValue(metadata.signalType),
    stringValue(metadata.insightType),
    stringValue(metadata.notificationType),
    stringValue(metadata.recommendationType),
    stringValue(metadata.opportunityType),
    args.sourceType
  ]);
  const commandFamily = args.actionableCommandType ?? 'none';
  return `${normalizeToken(entity)}|issue:${normalizeToken(issueClass)}|command:${normalizeToken(commandFamily)}`;
}

export function canonicalIssueKeyForComparable(record: OperatorQueueComparableRecord) {
  return buildCanonicalIssueKey({
    sourceType: record.sourceType,
    sourceId: record.id,
    clusterKey: record.clusterKey,
    actionableCommandType: record.actionableCommandType,
    metadata: record.metadata,
    relatedRecordIds: record.relatedRecordIds
  });
}

export function canonicalIssueKeyForQueueItem(
  record: Pick<OperatorQueueRecord, 'sourceType' | 'sourceId' | 'actionableCommandType' | 'metadata' | 'relatedRecordIds' | 'canonicalIssueKey'>
) {
  return record.canonicalIssueKey ?? buildCanonicalIssueKey({
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    actionableCommandType: record.actionableCommandType,
    metadata: record.metadata,
    relatedRecordIds: record.relatedRecordIds,
    clusterKey: stringValue(record.metadata.clusterKey)
  });
}

function firstDeterministicEntity(values: string[]) {
  return values.find((value) => /^(task|account|contact|calendar_event|workflow|gmail_draft):/.test(value)) ?? null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function firstString(values: Array<string | null | undefined>) {
  return values.find((value) => Boolean(value)) ?? 'unknown';
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_');
}
