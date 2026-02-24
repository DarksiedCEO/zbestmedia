export { loadEnv, type AppEnv } from "./config/env";
export * from "./crypto";
export { artifactRoutes } from "./artifacts/routes";
export { ArtifactService, type ArtifactRecord } from "./artifacts/service";
export {
  ArtifactIdParamSchema,
  CreateArtifactBodySchema,
  EvalGateSchema,
  EvalReportSchema,
  SupersedeArtifactBodySchema
} from "./artifacts/schemas";
export { TenantWriteBudget } from "./budgets/tenantBudget";
export { createPool, type DbPool } from "./db/pool";
export { withTenant } from "./db/withTenant";
export { authPlugin, type AuthContext } from "./http/auth";
export { requestIdPlugin } from "./http/requestId";
export {
  bindRequestLogger,
  createLogger,
  getRequestLogContext,
  type RequestLogContext
} from "./logging/requestContext";
export { buildServer } from "./server";
export * from "./policy";
export { leadModule } from "./lead/leadModule";
export { leadRoutes } from "./lead/http/leadRoutes";
export { intakeSchema, eventSchema } from "./lead/http/validators";
export { LeadRepo } from "./lead/repo/leadRepo";
export { LeadEventRepo } from "./lead/repo/eventRepo";
export { LeadScoreService } from "./lead/scoring/scoreService";
export { computeScoreV1 } from "./lead/scoring/scoreV1";
export type {
  LeadConversion,
  LeadEvent,
  LeadSnapshot,
  ScoreBreakdownItem,
  ScoreComputeInput,
  ScoreResult,
  ScoreVersion
} from "./lead/scoring/types";
export {
  incArtifactsCreated,
  incArtifactsSuperseded,
  incLeadEventsTotal,
  incLeadIntakeTotal,
  observeLeadIntakeDurationMs,
  observeLeadScoreRecomputeDurationMs,
  incSealVerificationFailures,
  incTenantBudgetViolations,
  resetMetricsForTests,
  snapshotMetrics,
  type MetricsSnapshot
} from "./metrics/counters";
