import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AgentExecutionService,
  AgentExecutionLedgerService,
  AgentMemoryAccessError,
  AgentOrgRoutingError,
  ApprovalWorkflowService,
  BrandPipelineOrchestrator,
  OrcaAgentPromptExecutor,
  EvalRunnerService,
  MemoryPartitionService
} from "../src/index.js";

function createLedgerStub() {
  let state: string = "requested";

  return {
    createAssignment: vi.fn(async () => ({
      assignmentRecordId: "assignment:req-1"
    })),
    createRun: vi.fn(async () => ({
      runRecordId: "run:req-1",
      currentState: "requested"
    })),
    transition: vi.fn(async ({ transition }: { transition: string }) => {
      const nextStateMap: Record<string, string> = {
        validate: "validated",
        route: "routed",
        block: "blocked",
        start_execution: "executing",
        succeed: "succeeded",
        fail: "failed",
        mark_retriable: "retriable"
      };
      state = nextStateMap[transition] ?? state;
      return {
        runRecordId: "run:req-1",
        currentState: state
      };
    }),
    attachExecution: vi.fn(async () => ({
      runRecordId: "run:req-1",
      currentState: state
    }))
  } as unknown as AgentExecutionLedgerService;
}

describe("agent-os execution and workflow services", () => {
  it("requires approval for customer-facing Brandyn executions", async () => {
    const repository = {
      createApprovalRequest: vi.fn(async () => ({
        approvalRequestId: "approval:brandyn:launch-copy",
        requiredApprovers: ["founder", "brand-lead"]
      })),
      createExecution: vi.fn(async () => ({
        executionId: "execution:brandyn:launch-copy",
        status: "PENDING_APPROVAL"
      })),
      appendExecutionStep: vi.fn(async () => ({}))
    } as never;

    const service = new AgentExecutionService(
      repository,
      new ApprovalWorkflowService(repository),
      undefined,
      undefined,
      undefined,
      createLedgerStub()
    );

    const result = await service.execute({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "brandyn",
      actorId: "founder",
      correlationId: "req-1",
      requestSource: "test-suite",
      subjectType: "copy",
      subjectId: "launch-copy",
      payload: { customerFacing: true }
    });

    expect(result.approvalRequired).toBe(true);
    if (result.approvalRequired) {
      expect(result.approvalRequestId).toContain("approval:brandyn");
    }
  });

  it("rejects writes to collections an agent does not own", async () => {
    const service = new MemoryPartitionService({} as never);

    await expect(
      service.writeOwnedEntry({
        tenantId: "11111111-1111-4111-8111-111111111111",
        agentId: "kobe",
        collection: "approved_taglines",
        entryKey: "x",
        entryValue: {},
        createdBy: "actor-1"
      })
    ).rejects.toBeInstanceOf(AgentMemoryAccessError);
  });

  it("runs the brand pipeline in the enforced order and attaches evals", async () => {
    const executionService = {
      execute: vi.fn(async () => ({
        execution: { executionId: "execution:brandyn:campaign-1", status: "COMPLETED" },
        approvalRequired: false,
        output: {
          summary: "Brandyn executed brand_identity_governance as brand_brain.",
          actions: ["Execute brand_identity_governance objective: define proof-led positioning"],
          risks: ["Denied capabilities: posting.direct_outbound"],
          approvalRequired: false,
          handoffTarget: "jordyn",
          evidence: ["allowedCapabilities=brand_rules.generate"]
        }
      }))
    } as never;

    const evalRunner = {
      runSuite: vi.fn(async () => ({
        evalRun: { evalRunId: "eval:brandyn" },
        scores: [{ metric: "tone_fidelity", passed: true }],
        missingMetrics: [],
        passed: true
      }))
    } as never;

    const orchestrator = new BrandPipelineOrchestrator(executionService, evalRunner);

    const result = await orchestrator.advance({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "req-1",
      requestSource: "test-suite",
      subjectId: "campaign-1",
      completedSteps: [],
      nextStep: "brandyn_direction_approved",
      payload: { messagingPillars: ["proof", "velocity"] },
      evalObservations: [{ metric: "tone_fidelity", score: 0.95 }]
    });

    expect(result.completedSteps).toEqual(["brandyn_direction_approved"]);
    expect(result.remainingSteps[0]).toBe("jordyn_visual_alignment_approved");
    expect(result.evalResult?.passed).toBe(true);
  });

  it("uses the injected prompt executor output contract", async () => {
    const repository = {
      createExecution: vi.fn(async () => ({
        executionId: "execution:oracle:analysis-1",
        status: "RUNNING"
      })),
      appendExecutionStep: vi.fn(async () => ({})),
      completeExecution: vi.fn(async () => ({}))
    } as never;

    const approvals = {
      ensureApproval: vi.fn(async () => ({ approvalRequired: false, reason: "advisory" }))
    } as never;

    const promptExecutor = {
      execute: vi.fn(async () => ({
        summary: "Oracle executed growth_intelligence as intelligence_analyst.",
        actions: ["Analyze launch performance."],
        risks: ["Denied capabilities: publishing.execute_campaign"],
        approvalRequired: false,
        handoffTarget: "titan",
        evidence: ["evalMetrics=metric_interpretation_accuracy"]
      }))
    } as never;

    const service = new AgentExecutionService(
      repository,
      approvals,
      promptExecutor,
      undefined,
      undefined,
      createLedgerStub()
    );
    const result = await service.execute({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "oracle",
      actorId: "analyst",
      correlationId: "req-2",
      requestSource: "test-suite",
      subjectType: "launch-analysis",
      subjectId: "analysis-1",
      payload: { objective: "Analyze launch performance." }
    });

    expect(result.approvalRequired).toBe(false);
    if (!result.approvalRequired) {
      expect(result.output.handoffTarget).toBe("titan");
    }
  });

  it("fails fast when execution requests are routed outside the owned lane", async () => {
    const repository = {} as never;
    const approvals = {
      ensureApproval: vi.fn(async () => ({ approvalRequired: false, reason: "advisory" }))
    } as never;
    const promptExecutor = {
      execute: vi.fn(async () => ({ summary: "should not execute" }))
    } as never;

    const service = new AgentExecutionService(
      repository,
      approvals,
      promptExecutor,
      undefined,
      undefined,
      createLedgerStub()
    );

    await expect(
      service.execute({
        tenantId: "11111111-1111-4111-8111-111111111111",
        agentId: "brandyn",
        actorId: "actor-1",
        correlationId: "req-3",
        requestSource: "test-suite",
        subjectType: "migration_integrity_monitoring",
        subjectId: "migration-1",
        payload: { responsibilityKey: "migration_integrity_monitoring" }
      })
    ).rejects.toBeInstanceOf(AgentOrgRoutingError);
  });

  it("parses ORCA-backed prompt execution output", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-os-prompts-"));
    const promptDir = path.join(tmpRoot, "intelligence", "prompts", "agent-os");
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptDir, "brandyn.governance.v1.md"),
      "# Prompt\\nINPUT\\n{{input_json}}\\n",
      "utf8"
    );

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Brandyn executed brand_identity_governance as brand_brain.",
                  actions: ["Define launch positioning."],
                  risks: ["Denied capabilities: posting.direct_outbound"],
                  approvalRequired: false,
                  handoffTarget: "jordyn",
                  evidence: ["memoryCollections=approved_taglines"]
                })
              }
            }
          ]
        })
    }));

    const originalFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    try {
      const executor = new OrcaAgentPromptExecutor({
        baseUrl: "https://example.invalid",
        token: "token",
        model: "orca-default",
        timeoutMs: 5000,
        promptRoot: promptDir
      });

      const output = await executor.execute({
        tenantId: "tenant-1",
        agentId: "brandyn",
        correlationId: "corr-1",
        payload: { objective: "Define launch positioning." }
      });

      expect(output.handoffTarget).toBe("jordyn");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
