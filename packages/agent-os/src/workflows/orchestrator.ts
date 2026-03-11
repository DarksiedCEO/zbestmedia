import type { AgentExecutionService } from "../execution/service.js";
import type { EvalRunnerService, EvalObservation } from "../evals/runner.js";
import { BRAND_PIPELINE_SEQUENCE, isValidBrandPipelineProgression, type BrandPipelineStep } from "./brandPipeline.js";

const STEP_TO_AGENT = {
  brandyn_direction_approved: "brandyn",
  jordyn_visual_alignment_approved: "jordyn",
  kobe_distribution_queued: "kobe",
  oracle_performance_evaluated: "oracle"
} as const;

export class BrandPipelineWorkflowError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class BrandPipelineOrchestrator {
  constructor(
    private readonly executionService: AgentExecutionService,
    private readonly evalRunner: EvalRunnerService
  ) {}

  async advance(args: {
    tenantId: string;
    actorId: string;
    correlationId: string;
    requestSource: string;
    subjectId: string;
    completedSteps: BrandPipelineStep[];
    nextStep: keyof typeof STEP_TO_AGENT;
    payload: Record<string, unknown>;
    evalObservations?: EvalObservation[];
    createdAt?: string;
  }) {
    const proposedSequence = [...args.completedSteps, args.nextStep];
    if (!isValidBrandPipelineProgression(proposedSequence)) {
      throw new BrandPipelineWorkflowError("invalid_brand_pipeline_progression");
    }

    const execution = await this.executionService.execute({
      tenantId: args.tenantId,
      agentId: STEP_TO_AGENT[args.nextStep],
      actorId: args.actorId,
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      subjectType: "brand_pipeline_step",
      subjectId: args.subjectId,
      payload: args.payload,
      createdAt: args.createdAt
    });

    const evalResult =
      args.evalObservations && args.evalObservations.length > 0
        ? await this.evalRunner.runSuite({
            tenantId: args.tenantId,
            agentId: STEP_TO_AGENT[args.nextStep],
            suiteName: `${args.nextStep}-eval`,
            createdBy: args.actorId,
            observations: args.evalObservations,
            createdAt: args.createdAt
          })
        : null;

    return {
      completedSteps: proposedSequence,
      remainingSteps: BRAND_PIPELINE_SEQUENCE.slice(proposedSequence.length),
      execution,
      evalResult
    };
  }
}
