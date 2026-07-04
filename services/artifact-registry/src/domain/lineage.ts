import { PrismaClient } from "@prisma/client";
import { Errors } from "./errors";

const SupersedesEdge = "supersedes";

async function traverse(prisma: PrismaClient, startId: string, direction: "forward" | "backward", maxDepth: number) {
  const visited = new Set<string>([startId]);
  const edges: { from: string; to: string }[] = [];
  let frontier = [startId];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      const where =
        direction === "forward"
          ? { fromArtifactId: id, edgeType: SupersedesEdge }
          : { toArtifactId: id, edgeType: SupersedesEdge };

      const found = await prisma.artifactLineageEdge.findMany({ where });
      for (const edge of found) {
        const from = edge.fromArtifactId;
        const to = edge.toArtifactId;
        const neighbor = direction === "forward" ? to : from;
        edges.push({ from, to });
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    depth += 1;
  }

  visited.delete(startId);
  return { ids: Array.from(visited), edges };
}

export async function getLineage(prisma: PrismaClient, workspaceId: string, artifactId: string, maxDepth = 10) {
  // Scoped by workspaceId, matching getArtifact: a wrong-workspace caller
  // sees NotFound, not another tenant's lineage graph.
  const artifact = await prisma.artifact.findFirst({ where: { artifactId, workspaceId } });
  if (!artifact) {
    throw Errors.NotFound("artifact not found");
  }

  const forward = await traverse(prisma, artifactId, "forward", maxDepth);
  const backward = await traverse(prisma, artifactId, "backward", maxDepth);

  // Defense in depth: the lineage edge table has no workspace column, so
  // even though write-time validation now prevents cross-workspace
  // supersedes links, re-verify every traversed id still belongs to this
  // workspace before it can appear in the response.
  const candidateIds = [...new Set([...forward.ids, ...backward.ids])];
  const scoped = candidateIds.length
    ? await prisma.artifact.findMany({ where: { artifactId: { in: candidateIds }, workspaceId } })
    : [];
  const scopedIds = new Set(scoped.map((record) => record.artifactId));

  const supersedes = forward.ids.filter((id) => scopedIds.has(id));
  const supersededBy = backward.ids.filter((id) => scopedIds.has(id));
  const edges = [...forward.edges, ...backward.edges].filter(
    (edge) =>
      (edge.from === artifactId || scopedIds.has(edge.from)) &&
      (edge.to === artifactId || scopedIds.has(edge.to))
  );

  return { artifact, supersedes, supersededBy, edges };
}
