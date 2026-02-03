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

export async function getLineage(prisma: PrismaClient, artifactId: string, maxDepth = 10) {
  const artifact = await prisma.artifact.findUnique({ where: { artifactId } });
  if (!artifact) {
    throw Errors.NotFound("artifact not found");
  }

  const forward = await traverse(prisma, artifactId, "forward", maxDepth);
  const backward = await traverse(prisma, artifactId, "backward", maxDepth);

  return {
    artifact,
    supersedes: forward.ids,
    supersededBy: backward.ids,
    edges: [...forward.edges, ...backward.edges]
  };
}
