import dagre from "dagre";
import type { Node, Edge } from "reactflow";

type LayoutOpts = {
  rankdir?: "TB" | "LR";
  nodeWidth?: number;
  nodeHeight?: number;
};

export function applyDagreLayout(nodes: Node[], edges: Edge[], opts: LayoutOpts = {}) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  const { rankdir = "LR", nodeWidth = 220, nodeHeight = 90 } = opts;

  g.setGraph({ rankdir, nodesep: 40, ranksep: 80 });

  nodes.forEach((n) => g.setNode(n.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const p = g.node(n.id) as { x: number; y: number } | undefined;
    if (!p) return n;
    return {
      ...n,
      position: {
        x: p.x - nodeWidth / 2,
        y: p.y - nodeHeight / 2
      }
    };
  });

  return { nodes: laidOut, edges };
}
