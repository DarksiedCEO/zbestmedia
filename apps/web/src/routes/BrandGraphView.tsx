import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useReactFlow
} from "reactflow";
import {
  brandgraphApi,
  brandgraphKeys,
  type GraphNode,
  type GraphEdge
} from "../contracts/brandgraph.contract";
import { SnapshotDiffPanel, type CompareTarget } from "../features/brandgraph/SnapshotDiffPanel";
import { NodeDetailsPanel } from "../features/brandgraph/NodeDetailsPanel";
import { applyDagreLayout } from "../features/brandgraph/layout/dagreLayout";

export function BrandGraphView() {
  const { id } = useParams();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<CompareTarget>("latest");

  const graphQuery = useQuery({
    queryKey: brandgraphKeys.graph(id ?? ""),
    queryFn: () => brandgraphApi.graph.get(id ?? ""),
    enabled: Boolean(id)
  });

  const snapshotsQuery = useQuery({
    queryKey: brandgraphKeys.snapshots(id ?? ""),
    queryFn: () => brandgraphApi.snapshots.list(id ?? ""),
    enabled: Boolean(id)
  });

  const rawNodes = useMemo(() => normalizeNodes(graphQuery.data?.nodes ?? []), [graphQuery.data?.nodes]);
  const rawEdges = useMemo(() => normalizeEdges(graphQuery.data?.edges ?? []), [graphQuery.data?.edges]);

  const { nodes, edges } = useMemo(() => {
    if (!rawNodes.length) return { nodes: [], edges: [] };
    return applyDagreLayout(rawNodes, rawEdges, { rankdir: "LR" });
  }, [rawNodes, rawEdges]);

  const selectedSnapshot = useMemo(
    () => snapshotsQuery.data?.snapshots.find((snapshot) => snapshot.eventId === selectedSnapshotId) ?? null,
    [snapshotsQuery.data?.snapshots, selectedSnapshotId]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Brand Graph</h1>
          <p className="muted">Brand ID: {id ?? "Unknown"}</p>
        </div>
        <NavLink className="button ghost" to="/brands">
          Back to Brands
        </NavLink>
      </header>

      <div className="graph-layout">
        <aside className="card graph-panel">
          <h2>Snapshots</h2>
          {snapshotsQuery.isLoading ? <p className="muted">Loading snapshots…</p> : null}
          {snapshotsQuery.error ? <p className="error">Unable to load snapshots.</p> : null}
          {snapshotsQuery.data && snapshotsQuery.data.snapshots.length > 0 ? (
            <ul className="list">
              {snapshotsQuery.data.snapshots.map((snapshot) => (
                <li key={snapshot.eventId} className="list-item">
                  <button
                    type="button"
                    className={`button ghost ${snapshot.eventId === selectedSnapshotId ? "active" : ""}`}
                    onClick={() => setSelectedSnapshotId(snapshot.eventId)}
                  >
                    {new Date(snapshot.createdAt).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No snapshots available.</p>
          )}
        </aside>

        <section className="card graph-canvas">
          <div className="graph-canvas-header">
            <h2>Graph</h2>
            {graphQuery.isLoading ? <span className="muted">Loading graph…</span> : null}
          </div>
          {graphQuery.error ? <p className="error">Unable to load graph.</p> : null}
          {nodes.length === 0 && !graphQuery.isLoading ? (
            <div className="empty-state">
              <p className="muted">No nodes returned for this brand yet.</p>
            </div>
          ) : null}
          {nodes.length > 0 ? (
            <div className="graph-flow">
              <ReactFlowProvider>
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedNodeId}
                  setSelectedNodeId={setSelectedNodeId}
                  hoveredNodeId={hoveredNodeId}
                  setHoveredNodeId={setHoveredNodeId}
                />
              </ReactFlowProvider>
            </div>
          ) : null}
          {nodes.length > 0 && edges.length === 0 ? (
            <div className="edge-empty-chip">No relationships yet</div>
          ) : null}
        </section>

        <aside className="card graph-panel">
          <h2>Details</h2>
          <NodeDetailsPanel
            selected={nodes.find((node) => node.id === selectedNodeId) ?? null}
            edges={edges}
          />

          <div className="detail-divider" />

          <SnapshotDiffPanel
            selectedSnapshot={selectedSnapshot}
            compareTo={compareTarget}
            onCompareChange={setCompareTarget}
            options={snapshotsQuery.data?.snapshots ?? []}
          />
        </aside>
      </div>
    </div>
  );
}

function normalizeNodes(nodes: GraphNode[]): Node[] {
  return nodes.map((node, index) => ({
    id: node.id,
    data: {
      label: node.label
    },
    position: { x: 40 + index * 40, y: 40 + index * 30 },
    type: "default"
  }));
}

function normalizeEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge, index) => ({
    id: edge.id ?? `edge-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: truncateLabel(edge.label),
    data: { fullLabel: edge.label },
    type: "default",
    labelStyle: edge.label ? { fontSize: 12 } : undefined,
    labelBgPadding: edge.label ? [6, 3] : undefined,
    labelBgBorderRadius: edge.label ? 8 : undefined
  }));
}

function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  setSelectedNodeId,
  hoveredNodeId,
  setHoveredNodeId
}: {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  setSelectedNodeId: (value: string | null) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (value: string | null) => void;
}) {
  const reactFlow = useReactFlow();
  const lastCenteredId = useRef<string | null>(null);

  const activeNodeId = selectedNodeId ?? hoveredNodeId;

  const neighborsById = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach((edge) => {
      if (!map.has(edge.source)) map.set(edge.source, []);
      if (!map.has(edge.target)) map.set(edge.target, []);
      map.get(edge.source)!.push(edge.target);
      map.get(edge.target)!.push(edge.source);
    });
    return map;
  }, [edges]);

  const adjacency = useMemo(() => {
    if (!activeNodeId) {
      return { nodes: new Set<string>(), edges: new Set<string>() };
    }
    const nodesSet = new Set<string>([activeNodeId]);
    const edgesSet = new Set<string>();
    edges.forEach((edge) => {
      if (edge.source === activeNodeId || edge.target === activeNodeId) {
        edgesSet.add(edge.id);
        nodesSet.add(edge.source);
        nodesSet.add(edge.target);
      }
    });
    return { nodes: nodesSet, edges: edgesSet };
  }, [activeNodeId, edges]);

  const styledNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        style: activeNodeId && !adjacency.nodes.has(node.id) ? { opacity: 0.25 } : undefined
      })),
    [nodes, activeNodeId, adjacency.nodes]
  );

  const styledEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: adjacency.edges.has(edge.id),
        style: activeNodeId && !adjacency.edges.has(edge.id) ? { opacity: 0.15 } : undefined
      })),
    [edges, activeNodeId, adjacency.edges]
  );

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    setSelectedNodeId(node.id);
  };

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        reactFlow.fitView({ padding: 0.2, duration: 250 });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNodeId(null);
        setHoveredNodeId(null);
        return;
      }

      if (!selectedNodeId) return;

      const neighbors = neighborsById.get(selectedNodeId) ?? [];
      if (!neighbors.length) return;

      const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
      const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!isNext && !isPrev) return;

      event.preventDefault();

      const currentIndex = neighbors.indexOf(selectedNodeId);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = isNext
        ? (startIndex + 1) % neighbors.length
        : (startIndex - 1 + neighbors.length) % neighbors.length;

      setSelectedNodeId(neighbors[nextIndex]);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [neighborsById, selectedNodeId, reactFlow, setSelectedNodeId, setHoveredNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (lastCenteredId.current === selectedNodeId) return;

    const node = reactFlow.getNode(selectedNodeId);
    if (!node) return;

    lastCenteredId.current = selectedNodeId;

    const x = node.positionAbsolute?.x ?? node.position.x;
    const y = node.positionAbsolute?.y ?? node.position.y;
    const width = node.width ?? 0;
    const height = node.height ?? 0;

    reactFlow.setCenter(x + width / 2, y + height / 2, {
      zoom: 1.1,
      duration: 250
    });
  }, [reactFlow, selectedNodeId]);

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
      onNodeMouseLeave={() => setHoveredNodeId(null)}
      fitView
    >
      <Background gap={18} size={1} color="#e2e8f0" />
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
}

function truncateLabel(label?: string) {
  if (!label) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}
