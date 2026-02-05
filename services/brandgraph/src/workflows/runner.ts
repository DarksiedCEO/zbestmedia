import { generateEventId } from "../domain/ids.js";
import type { BrandGraphRepo } from "../domain/repo.js";
import type { Workflow, WorkflowContext } from "./types.js";

export class WorkflowRunner {
  constructor(private readonly repo: BrandGraphRepo) {}

  async run(workflow: Workflow, ctx: WorkflowContext): Promise<void> {
    for (let index = 0; index < workflow.steps.length; index += 1) {
      const step = workflow.steps[index];
      await step(ctx);
      await this.repo.createEvent({
        id: generateEventId(),
        tenantId: ctx.tenantId,
        brandId: ctx.brandId,
        eventType: "WORKFLOW_STEP_COMPLETED",
        payload: { workflow: workflow.name, step: index },
      });
    }
  }
}
