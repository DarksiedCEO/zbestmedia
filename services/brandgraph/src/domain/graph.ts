export type GraphNodeType = 'brand' | 'artifact';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: 'ARTIFACT_LINKED';
  createdAt: string;
  eventId?: string;
}

export interface GraphSnapshot {
  brandId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  nextCursor: string | null;
}

export interface GraphSnapshotMeta {
  eventId: string;
  createdAt: string;
}

export interface GraphSnapshotList {
  brandId: string;
  snapshots: GraphSnapshotMeta[];
  nextCursor: string | null;
}

/**
 * Deterministic read-only query options
 */
export interface GraphQueryOptions {
  limit?: number;              // default enforced in repo
  cursor?: string;             // eventId cursor
  eventTypes?: Array<'ARTIFACT_LINKED'>;
  fromTimestamp?: string;
  toTimestamp?: string;
}
