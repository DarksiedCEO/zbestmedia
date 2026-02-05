import { generateEventId } from "../domain/ids.js";
import type { BrandGraphRepo } from "../domain/repo.js";
import type { Workflow } from "./types.js";

export function createArtifactLinkWorkflow(repo: BrandGraphRepo): Workflow {
  return {
    name: "ArtifactLinkPropagation",
    steps: [
      async (ctx) => {
        // TODO: validate artifact with Artifact Registry once integration exists.
        await repo.createEvent({
          id: generateEventId(),
          tenantId: ctx.tenantId,
          brandId: ctx.brandId,
          eventType: "GRAPH_SNAPSHOT_UPDATED",
          payload: { source: "ARTIFACT_LINKED" },
        });
      },
    ],
  };
}
