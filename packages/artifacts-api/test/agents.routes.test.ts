import Fastify, { type FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { agentRoutes } from "../src/agents/routes";
import { requestIdPlugin } from "../src/http/requestId";

describe("agent routes", () => {
  let app: ReturnType<typeof Fastify>;
  const repository = {
    provisionFoundation: vi.fn(async () => ({
      agents: [{ agentId: "brandyn" }, { agentId: "jordyn" }, { agentId: "kobe" }]
    })),
    listAgents: vi.fn(async () => [
      { agentId: "brandyn", taskDomain: "brand_identity_governance", currentStatus: "draft" },
      { agentId: "jordyn", taskDomain: "visual_identity_governance", currentStatus: "draft" },
      { agentId: "kobe", taskDomain: "social_campaign_deployment", currentStatus: "draft" }
    ]),
    appendLifecycleEvent: vi.fn(async () => ({ lifecycleEventId: "lifecycle:brandyn", toStatus: "training" })),
    recordApprovalDecision: vi.fn(async () => ({ approvalDecisionId: "decision:1" }))
  } as never;
  const executionService = {
    execute: vi.fn(async () => ({
      execution: { executionId: "execution:brandyn:subject-1", status: "COMPLETED" },
      approvalRequired: false,
      output: { kind: "brand_governance_output" }
    }))
  } as never;
  const memoryService = {
    readPartition: vi.fn(async () => [{ memoryEntryId: "memory:1" }]),
    writeOwnedEntry: vi.fn(async () => ({ memoryEntryId: "memory:1" })),
    writeSharedPolicyEntry: vi.fn(async () => ({ memoryEntryId: "memory:policy" }))
  } as never;
  const evalRunner = {
    runSuite: vi.fn(async () => ({ passed: true, missingMetrics: [], evalRun: { evalRunId: "eval:1" }, scores: [] }))
  } as never;
  const workflow = {
    advance: vi.fn(async () => ({
      completedSteps: ["brandyn_direction_approved"],
      remainingSteps: ["jordyn_visual_alignment_approved"],
      execution: {
        execution: { executionId: "execution:brandyn:campaign-1", status: "COMPLETED" },
        approvalRequired: false,
        output: { kind: "brand_governance_output" }
      },
      evalResult: null
    }))
  } as never;

  beforeAll(async () => {
    app = Fastify();
    await app.register(requestIdPlugin);
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.auth = {
        tenantId: "11111111-1111-4111-8111-111111111111",
        actorId: "actor-1",
        roles: ["admin"]
      };
    });
    await app.register(
      agentRoutes({
        repository,
        executionService,
        memoryService,
        evalRunner,
        workflow
      })
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("provisions the brand agent foundation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/provision-foundation",
      payload: { versionLabel: "foundation-v1" }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().agents).toHaveLength(3);
  });

  it("executes an agent request with normalized response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/brandyn/execute",
      payload: {
        subjectType: "copy",
        subjectId: "subject-1",
        payload: { messagingPillars: ["proof"] }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      approvalRequired: false,
      output: { kind: "brand_governance_output" }
    });
  });

  it("records eval runs and exposes memory reads", async () => {
    const evalRes = await app.inject({
      method: "POST",
      url: "/v1/agents/jordyn/evals/run",
      payload: {
        suiteName: "visual-consistency",
        observations: [{ metric: "design_token_compliance", score: 0.99 }]
      }
    });
    const memoryRes = await app.inject({
      method: "GET",
      url: "/v1/agents/jordyn/memory?collection=company_policy"
    });

    expect(evalRes.statusCode).toBe(200);
    expect(evalRes.json().passed).toBe(true);
    expect(memoryRes.statusCode).toBe(200);
    expect(memoryRes.json().items[0].memoryEntryId).toBe("memory:1");
  });

  it("advances the brand pipeline route", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/workflows/brand-pipeline/advance",
      payload: {
        subjectId: "campaign-1",
        completedSteps: [],
        nextStep: "brandyn_direction_approved",
        payload: { messagingPillars: ["proof"] }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().completedSteps).toEqual(["brandyn_direction_approved"]);
  });
});
