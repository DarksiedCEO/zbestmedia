import type { FastifyBaseLogger } from "fastify";

import { computeScoreV1 } from "./scoreV1";
import type { ScoreComputeInput, ScoreResult } from "./types";

export class LeadScoreService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  compute(input: ScoreComputeInput): ScoreResult {
    const result = computeScoreV1(input);

    this.logger.info(
      {
        tenantId: input.snapshot.tenantId,
        leadId: input.snapshot.id,
        version: result.version,
        scoreTotal: result.scoreTotal,
        breakdown: result.breakdown,
        lifecycleStage: result.lifecycleStage
      },
      "lead score recompute"
    );

    return result;
  }
}
