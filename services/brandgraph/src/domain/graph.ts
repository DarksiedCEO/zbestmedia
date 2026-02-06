export type GraphNodeType = 'brand' | 'artifact';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'ARTIFACT_LINKED';
  eventId: string;
  createdAt: string;
}

export interface GraphSnapshot {
  brandId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphSnapshotMeta {
  eventId: string;
  createdAt: string;
}

export interface GraphSnapshotList {
  brandId: string;
  snapshots: GraphSnapshotMeta[];
}
