export type ScoreVersion = "v1";

export type LeadSnapshot = {
  id: string;
  tenantId: string;

  email?: string | null;
  companyDomain?: string | null;

  source: string;
  channel?: string | null;
  sourceRef?: string | null;

  lifecycleStage?: string | null;
};

export type LeadEvent = {
  id: string;
  type: string;
  createdAt: Date;
  payload: Record<string, unknown>;
};

export type LeadConversion = {
  id: string;
  type: string;
  createdAt: Date;
  valueUsd?: number | null;
  meta: Record<string, unknown>;
};

export type ScoreBreakdownItem = {
  key: string;
  points: number;
  reason: string;
};

export type ScoreResult = {
  version: ScoreVersion;
  scoreTotal: number;
  breakdown: ScoreBreakdownItem[];
  lifecycleStage?: "new" | "mql" | "sql" | "opportunity" | "customer" | "disqualified";
};

export type ScoreComputeInput = {
  snapshot: LeadSnapshot;
  events: LeadEvent[];
  conversions: LeadConversion[];
  now: Date;
};
