import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Database, S, approvalRequest, route, scopeRequest, tokenA, tokenB } from "./helpers/postgres";

type Application = Awaited<ReturnType<Database["application"]>>;
describe("C07–C10 restricted caller binding; C19 observation only", () => {
  const db = new Database();
  const applications: Application[] = [];
  beforeAll(async () => { await db.start(); });
  beforeEach(async () => {
    // Administrator fixture setup is outside every observation/no-write interval.
    await db.admin.query(`UPDATE ${S}.tenants SET status='ACTIVE'; UPDATE ${S}.campaigns SET status='ACTIVE';
      UPDATE ${S}.caller_bindings SET active=true, capabilities=ARRAY['READ'] WHERE login IN ('reader_a','reader_b','campaign_a');
      UPDATE ${S}.grants SET status='ACTIVE', changed_at=NULL, successor_id=NULL,
        valid_from=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()+interval '1 day' WHERE capability='READ'`);
  });
  afterEach(async () => { await Promise.all(applications.splice(0).map(a => a.close())); });
  afterAll(async () => { await db.stop(); });
  async function application(...args: Parameters<Database["application"]>) {
    const a = await db.application(...args); applications.push(a); return a.app;
  }
  function send(app: FastifyInstance, payload = scopeRequest(), token = tokenA) {
    return app.inject({ method: "POST", url: route, headers: { authorization: `Bearer ${token}` }, payload });
  }
  function denied(response: Awaited<ReturnType<typeof send>>) {
    expect(response.statusCode).toBe(403);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { requestId, ...body } = response.json();
    expect(requestId).toEqual(expect.any(String));
    expect(response.body).not.toMatch(/reader_a|reader_b|campaign-|tenant-|42501|zbm_authority|fixture-token/);
    return body;
  }
  it("C07 maps the opaque service token to its actual restricted session and principal", async () => {
    const reader = await db.connect("reader_a");
    expect((await reader.query("SELECT session_user::text AS login, current_user::text AS role")).rows).toEqual([{ login: "reader_a", role: "reader_a" }]);
    const observation = await reader.query(`SELECT ${S}.observe_authority($1,$2,$3,$4) AS result`, ["tenant-a", "campaign-a", "SIMULATION", "READ"]);
    expect(observation.rows[0].result).toMatchObject({ principal: db.configuration().bindings[0]!.principal, tenant: "tenant-a", campaign: "campaign-a", purpose: "SIMULATION", capability: "READ" });
    const response = await send(await application());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "OBSERVED_ONLY", execution: "DISABLED", kind: "SCOPE_READ", requestId: expect.any(String) });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it.each(["tenants", "campaigns", "caller_bindings", "grants", "approvals", "evidence"])("C07 restricted login cannot SELECT base table %s (42501)", async table => {
    const reader = await db.connect("reader_a");
    await expect(reader.query(`SELECT * FROM ${S}.${table}`)).rejects.toMatchObject({ code: "42501" });
  });
  it.each(["zbm_ae_owner", "zbm_ae_migrator", "zbm_ae_authority_writer", "zbm_ae_approval_writer", "zbm_ae_auditor"])("C07 restricted login cannot escalate to %s", async role => {
    const reader = await db.connect("reader_a");
    await expect(reader.query(`SET ROLE ${role}`)).rejects.toMatchObject({ code: "42501" });
    expect((await reader.query("SELECT session_user::text AS login, current_user::text AS role")).rows[0]).toEqual({ login: "reader_a", role: "reader_a" });
  });
  it("C07 rejects an observation with the wrong protected principal", async () => {
    const response = await send(await application("reader_a", "unrelated-principal"));
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toMatch(/reader_a|unrelated-principal|OBSERVED_ONLY/);
  });
  it("C07 rejects a credential-slot login mismatch during configuration", async () => {
    expect((await send(await application())).statusCode).toBe(200);
    await expect(application("reader_a", "reader_a", "reader_b")).rejects.toThrow(/configuration|credential|login|mapping/i);
  });
  it("C07 service tenant membership does not authorize an unbound DB login", async () => {
    denied(await send(await application("unbound")));
    const reader = await db.connect("unbound");
    await expect(reader.query(`SELECT ${S}.observe_authority($1,$2,$3,$4)`, ["tenant-a", "campaign-a", "SIMULATION", "READ"])).rejects.toMatchObject({ code: "42501" });
  });
  it("C07/C10 binding deactivation is observed on the next request", async () => {
    const app = await application();
    expect((await send(app)).statusCode).toBe(200);
    await db.admin.query(`SELECT ${S}.change_binding('reader_a',false)`);
    denied(await send(app));
  });
  it("C08 missing and foreign tenant/campaign scopes have the same generic denial", async () => {
    const app = await application();
    const payloads = [scopeRequest("missing"), scopeRequest("campaign-c"), scopeRequest("campaign-c", "tenant-b"), scopeRequest("campaign-a", "missing")];
    const responses = [];
    for (const payload of payloads) responses.push(denied(await send(app, payload)));
    for (const body of responses) expect(body).toEqual(responses[0]);
    const reader = await db.connect("reader_a");
    for (const { scope } of payloads) await expect(reader.query(`SELECT ${S}.observe_authority($1,$2,$3,$4)`, [scope.tenantId, scope.campaignId, "SIMULATION", "READ"])).rejects.toMatchObject({ code: "42501" });
  });
  it("C08 campaign-specific binding cannot borrow its service's other campaign", async () => {
    const app = await application("campaign_a");
    expect((await send(app)).statusCode).toBe(200);
    denied(await send(app, scopeRequest("campaign-b")));
  });
  it("C09 sequential and concurrent principals remain isolated, including after one is revoked", async () => {
    const app = await application();
    for (let i = 0; i < 3; i++) {
      expect((await send(app)).statusCode).toBe(200);
      expect((await send(app, scopeRequest("campaign-c", "tenant-b"), tokenB)).statusCode).toBe(200);
      denied(await send(app, scopeRequest(), tokenB));
      denied(await send(app, scopeRequest("campaign-c", "tenant-b")));
    }
    await db.admin.query(`SELECT ${S}.change_binding('reader_a',false)`);
    const pairs = await Promise.all(Array.from({ length: 6 }, async () => Promise.all([
      send(app), send(app, scopeRequest("campaign-c", "tenant-b"), tokenB)
    ])));
    for (const [a, b] of pairs) { denied(a); expect(b.statusCode).toBe(200); }
  });
  it.each([
    ["expired", "valid_from=clock_timestamp()-interval '2 days', expires_at=clock_timestamp()-interval '1 day'"],
    ["future", "valid_from=clock_timestamp()+interval '1 day', expires_at=clock_timestamp()+interval '2 days'"],
    ["revoked", "status='REVOKED', changed_at=clock_timestamp()"]
  ])("C10 %s READ grant denies despite an active binding, without cached authority", async (_label, update) => {
    const app = await application();
    expect((await send(app)).statusCode).toBe(200);
    await db.admin.query(`UPDATE ${S}.grants SET ${update} WHERE id='reader_a-READ'`);
    denied(await send(app));
  });
  it("C10 a current grant cannot replace READ in the binding", async () => {
    await db.admin.query(`UPDATE ${S}.caller_bindings SET capabilities=ARRAY[]::text[] WHERE login='reader_a'`);
    denied(await send(await application()));
  });
  it("C10 an active READ binding cannot replace a missing READ grant", async () => {
    const app = await application();
    expect((await send(app)).statusCode).toBe(200);
    // Restore administrator fixture data after the independently authenticated requests.
    await db.admin.query(`UPDATE ${S}.grants SET capability='AUDIT' WHERE id='reader_a-READ'`);
    try { denied(await send(app)); }
    finally { await db.admin.query(`UPDATE ${S}.grants SET capability='READ' WHERE id='reader_a-READ'`); }
  });
  it.each(["SUSPENDED", "REVOKED"])("C10 %s tenant/campaign denies even with excess AUDIT authority", async status => {
    await db.admin.query(`UPDATE ${S}.caller_bindings SET capabilities=ARRAY['READ','AUDIT'] WHERE login='reader_a';
      INSERT INTO ${S}.grants(id,tenant_id,scope_kind,principal,purpose,capability,valid_from,expires_at)
      VALUES('reader-a-audit','tenant-a','TENANT','reader_a','SIMULATION','AUDIT',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day') ON CONFLICT DO NOTHING`);
    const app = await application();
    expect((await send(app)).statusCode).toBe(200);
    await db.admin.query(`UPDATE ${S}.campaigns SET status=$1 WHERE id='campaign-a'`, [status]);
    denied(await send(app));
    expect((await send(app, scopeRequest("campaign-b"))).statusCode).toBe(200);
    await db.admin.query(`UPDATE ${S}.tenants SET status=$1 WHERE id='tenant-a'`, [status]);
    denied(await send(app, scopeRequest("campaign-b")));
  });
  it("C19 mixed successful reads and denials leave all six B tables unchanged; commands are unavailable", async () => {
    const app = await application();
    const before = await db.snapshot();
    expect(Object.keys(before).sort()).toEqual(["approvals", "caller_bindings", "campaigns", "evidence", "grants", "tenants"]);
    expect((await send(app)).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: route, headers: { authorization: `Bearer ${tokenA}` }, payload: approvalRequest() })).statusCode).toBe(200);
    denied(await send(app, scopeRequest("missing")));
    denied(await send(app, scopeRequest("campaign-c", "tenant-b")));
    expect((await send(app, scopeRequest(), "invalid-token")).statusCode).toBe(401);
    for (const url of ["/commands", "/internal/simulation/commands"]) expect((await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${tokenA}` }, payload: scopeRequest() })).statusCode).toBe(404);
    expect(await db.snapshot()).toEqual(before);
  });
});
