import fs from "node:fs";
import path from "node:path";

export type BudgetKind = "ci_loadrun" | "prod_drift" | "canary_observe";

export type BudgetState = {
  day: string;
  month: string;
  daily_requests_used: number;
  monthly_requests_used: number;
  canary_observe_runs_daily: number;
  updated_at: string;
};

export type BudgetLimits = {
  dailyMaxRequests: number;
  monthlyMaxRequests: number;
  canaryMaxObserveRunsPerDay: number;
};

export type BudgetDecision = {
  allowed: boolean;
  reason?: string;
  state: BudgetState;
  limits: BudgetLimits;
  remaining: {
    dailyRequests: number;
    monthlyRequests: number;
    canaryObserveRunsDaily: number;
  };
};

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function utcMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function defaultState(now = new Date()): BudgetState {
  return {
    day: utcDay(now),
    month: utcMonth(now),
    daily_requests_used: 0,
    monthly_requests_used: 0,
    canary_observe_runs_daily: 0,
    updated_at: now.toISOString()
  };
}

function statePath(env: Record<string, string | undefined>): string {
  return path.resolve(process.cwd(), env.POLICY_BUDGET_STATE_PATH ?? "ops/incidents/budget_state.json");
}

export function readBudgetLimits(env: Record<string, string | undefined> = process.env): BudgetLimits {
  const num = (key: string, fallback: number): number => {
    const raw = env[key];
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.floor(parsed);
  };
  return {
    dailyMaxRequests: num("POLICY_LOAD_BUDGET_DAILY_MAX_REQUESTS", 200_000),
    monthlyMaxRequests: num("POLICY_LOAD_BUDGET_MONTHLY_MAX_REQUESTS", 2_000_000),
    canaryMaxObserveRunsPerDay: num("POLICY_CANARY_MAX_OBSERVE_RUNS_PER_DAY", 24)
  };
}

export function readBudgetState(env: Record<string, string | undefined> = process.env, now = new Date()): BudgetState {
  const file = statePath(env);
  if (!fs.existsSync(file)) return defaultState(now);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BudgetState;
    const base = defaultState(now);
    if (parsed.day !== base.day) {
      parsed.day = base.day;
      parsed.daily_requests_used = 0;
      parsed.canary_observe_runs_daily = 0;
    }
    if (parsed.month !== base.month) {
      parsed.month = base.month;
      parsed.monthly_requests_used = 0;
    }
    return parsed;
  } catch {
    return defaultState(now);
  }
}

export function writeBudgetState(state: BudgetState, env: Record<string, string | undefined> = process.env): void {
  const file = statePath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function remaining(state: BudgetState, limits: BudgetLimits) {
  return {
    dailyRequests: Math.max(0, limits.dailyMaxRequests - state.daily_requests_used),
    monthlyRequests: Math.max(0, limits.monthlyMaxRequests - state.monthly_requests_used),
    canaryObserveRunsDaily: Math.max(0, limits.canaryMaxObserveRunsPerDay - state.canary_observe_runs_daily)
  };
}

export function getBudgetStatus(env: Record<string, string | undefined> = process.env, now = new Date()): BudgetDecision {
  const limits = readBudgetLimits(env);
  const state = readBudgetState(env, now);
  return {
    allowed: true,
    state,
    limits,
    remaining: remaining(state, limits)
  };
}

export function consumeBudget(args: {
  kind: BudgetKind;
  requests: number;
  env?: Record<string, string | undefined>;
  now?: Date;
}): BudgetDecision {
  const env = args.env ?? process.env;
  const now = args.now ?? new Date();
  const limits = readBudgetLimits(env);
  const state = readBudgetState(env, now);
  const req = Math.max(0, Math.floor(args.requests));

  const next: BudgetState = {
    ...state,
    daily_requests_used: state.daily_requests_used + req,
    monthly_requests_used: state.monthly_requests_used + req,
    canary_observe_runs_daily:
      args.kind === "canary_observe" ? state.canary_observe_runs_daily + 1 : state.canary_observe_runs_daily,
    updated_at: now.toISOString()
  };

  if (next.daily_requests_used > limits.dailyMaxRequests) {
    return {
      allowed: false,
      reason: "daily_budget_exceeded",
      state,
      limits,
      remaining: remaining(state, limits)
    };
  }
  if (next.monthly_requests_used > limits.monthlyMaxRequests) {
    return {
      allowed: false,
      reason: "monthly_budget_exceeded",
      state,
      limits,
      remaining: remaining(state, limits)
    };
  }
  if (next.canary_observe_runs_daily > limits.canaryMaxObserveRunsPerDay) {
    return {
      allowed: false,
      reason: "canary_observe_budget_exceeded",
      state,
      limits,
      remaining: remaining(state, limits)
    };
  }

  writeBudgetState(next, env);
  return {
    allowed: true,
    state: next,
    limits,
    remaining: remaining(next, limits)
  };
}

export function resetBudgetState(env: Record<string, string | undefined> = process.env, now = new Date()): BudgetState {
  const state = defaultState(now);
  writeBudgetState(state, env);
  return state;
}
