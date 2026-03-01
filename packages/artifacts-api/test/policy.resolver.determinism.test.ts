import { describe, expect, it } from "vitest";
import type { PoolClient, QueryResult } from "pg";

import { PolicyService } from "../src/agency/policy/policyService";
import { resolutionHash } from "../src/agency/policy/resolve/resolutionHash";

type QueryImpl = (sql: string, params?: unknown[]) => Promise<QueryResult<any>>;

function createClient(queryImpl: QueryImpl): PoolClient {
  return {
    query: queryImpl
  } as unknown as PoolClient;
}

describe("policy resolver determinism", () => {
  it("returns identical output and hash for identical inputs", async () => {
    const queryImpl: QueryImpl = async (_sql, params = []) => {
      const scopeType = params[1] as string;
      const scopeId = params[2] as string | null;

      if (scopeType === "campaign" && scopeId === "camp_test") {
        return {
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [
            {
              id: "pv-campaign-test",
              version: 3,
              scope_type: "campaign",
              value_json: { b: 2, a: { d: 4, c: 3 } }
            }
          ]
        };
      }

      return {
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
        rows: []
      };
    };

    const service = new PolicyService(createClient(queryImpl));
    const now = new Date("2026-02-28T00:00:00.000Z");

    const a = await service.resolve(
      "00000000-0000-0000-0000-000000000001",
      "performance_limits",
      now,
      "11111111-1111-1111-1111-111111111111",
      "camp_test"
    );
    const b = await service.resolve(
      "00000000-0000-0000-0000-000000000001",
      "performance_limits",
      now,
      "11111111-1111-1111-1111-111111111111",
      "camp_test"
    );

    expect(a).toEqual(b);
    expect(a.meta.resolution_hash).toBeTruthy();
    expect(resolutionHash(a.resolved).hash).toBe(resolutionHash(b.resolved).hash);
    expect(a.meta.resolution_hash).toBe(resolutionHash(a.resolved).hash);
  });

  it("changes hash when resolved output changes", async () => {
    const queryImpl: QueryImpl = async (_sql, params = []) => {
      const scopeType = params[1] as string;
      const scopeId = params[2] as string | null;

      if (scopeType === "campaign" && scopeId === "camp_test") {
        return {
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [
            {
              id: "pv-campaign-a",
              version: 1,
              scope_type: "campaign",
              value_json: { maxCPA: 120, maxErrorRate: 0.01, maxPodFailureRate: 0.01, maxRouteLatencyP95: 1000 }
            }
          ]
        };
      }

      if (scopeType === "campaign" && scopeId === "camp_other") {
        return {
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [
            {
              id: "pv-campaign-b",
              version: 1,
              scope_type: "campaign",
              value_json: { maxCPA: 300, maxErrorRate: 0.01, maxPodFailureRate: 0.01, maxRouteLatencyP95: 1000 }
            }
          ]
        };
      }

      return {
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
        rows: []
      };
    };

    const service = new PolicyService(createClient(queryImpl));
    const now = new Date("2026-02-28T00:00:00.000Z");

    const a = await service.resolve(
      "00000000-0000-0000-0000-000000000001",
      "performance_limits",
      now,
      "11111111-1111-1111-1111-111111111111",
      "camp_test"
    );
    const b = await service.resolve(
      "00000000-0000-0000-0000-000000000001",
      "performance_limits",
      now,
      "11111111-1111-1111-1111-111111111111",
      "camp_other"
    );

    expect(a.meta.resolution_hash).not.toBe(b.meta.resolution_hash);
    expect(resolutionHash(a.resolved).hash).not.toBe(resolutionHash(b.resolved).hash);
  });
});
