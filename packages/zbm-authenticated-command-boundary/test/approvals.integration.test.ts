import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Database, S, approvalRequest, route, scopeRequest, tokenA, tokenB } from "./helpers/postgres";

describe("C11–C13 exact-reference approval inspection; C19 no writes", () => {
  const db = new Database();
  let application: Awaited<ReturnType<Database["application"]>> | undefined;
  beforeAll(async () => { await db.start(); });
  beforeEach(async () => {
    await db.admin.query(`UPDATE ${S}.tenants SET status='ACTIVE'; UPDATE ${S}.campaigns SET status='ACTIVE';
      UPDATE ${S}.caller_bindings SET active=true WHERE login='reader_a';
      UPDATE ${S}.grants SET status='ACTIVE', changed_at=NULL, valid_from=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()+interval '1 day' WHERE id='reader_a-READ';
      UPDATE ${S}.approvals SET status='ACTIVE', changed_at=NULL, successor_id=NULL,
        valid_from=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()+interval '1 day' WHERE id='approval-a'`);
    application = await db.application();
  });
  afterEach(async () => { if (application) { await application.close(); application = undefined; } });
  afterAll(async () => { await db.stop(); });
  function send(payload: object = approvalRequest(), token = tokenA) {
    return application!.app.inject({ method: "POST", url: route, headers: { authorization: `Bearer ${token}` }, payload });
  }
  function denied(response: Awaited<ReturnType<typeof send>>) {
    expect(response.statusCode).toBe(403);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { requestId, ...body } = response.json();
    expect(requestId).toEqual(expect.any(String));
    expect(response.body).not.toMatch(/approval-a|cut-a|tenant-|campaign-|writer_a|reader_a|zbm_authority|42501|fixture-token/);
    return body;
  }
  async function missingDenial() {
    const request = approvalRequest(); request.approval.id = "absent-reference";
    return denied(await send(request));
  }
  it("C11 resolves the exact persisted tuple and returns only an observation DTO", async () => {
    const response = await send();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "OBSERVED_ONLY", execution: "DISABLED", kind: "APPROVAL_READ", requestId: expect.any(String) });
    expect(response.headers["cache-control"]).toBe("no-store");
    // No assertion here claims the referenced v1 is the current domain subject.
  });
  it.each([
    ["id", "absent-reference"], ["subjectType", "OTHER"], ["subjectId", "other-cut"],
    ["subjectVersion", "v2"], ["subjectSha256", "b".repeat(64)], ["issuer", "EDITORIAL"]
  ])("C11 wrong %s is indistinguishable from a missing exact reference", async (field, value) => {
    const baseline = await missingDenial();
    const request = approvalRequest();
    Object.assign(request.approval, { [field]: value });
    expect(denied(await send(request))).toEqual(baseline);
  });
  it("C11 wrong campaign denies even when that campaign is readable", async () => {
    expect((await send(scopeRequest("campaign-b"))).statusCode).toBe(200);
    const request = approvalRequest(); request.scope.campaignId = "campaign-b";
    expect(denied(await send(request))).toEqual(await missingDenial());
  });
  it("C11 another tenant's valid caller cannot resolve the foreign approval reference", async () => {
    expect((await send(scopeRequest("campaign-c", "tenant-b"), tokenB)).statusCode).toBe(200);
    const request = approvalRequest(); request.scope = { tenantId: "tenant-b", campaignId: "campaign-c" };
    expect(denied(await send(request, tokenB))).toEqual(await missingDenial());
    expect(denied(await send(approvalRequest(), tokenB))).toEqual(await missingDenial());
  });
  it.each([
    ["expired", "valid_from=clock_timestamp()-interval '2 days', expires_at=clock_timestamp()-interval '1 day'"],
    ["future", "valid_from=clock_timestamp()+interval '1 day', expires_at=clock_timestamp()+interval '2 days'"],
    ["revoked", "status='REVOKED', changed_at=clock_timestamp()"],
    ["revoked with future change timestamp", "status='REVOKED', changed_at=clock_timestamp()+interval '1 day'"]
  ])("C12 %s reference is denied after a successful inspection", async (_label, update) => {
    expect((await send()).statusCode).toBe(200);
    await db.admin.query(`UPDATE ${S}.approvals SET ${update} WHERE id='approval-a'`);
    expect(denied(await send())).toEqual(await missingDenial());
  });
  it.each(["-", "+"])("C12 supersession denies predecessor with %s one-day change timestamp; exact successor remains inspectable", async sign => {
    await db.admin.query(`INSERT INTO ${S}.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at)
      SELECT 'approval-successor','tenant-a','campaign-a',subject_type,subject_id,'v2',$1,issuer,actor,custodial_login,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day'
      FROM ${S}.approvals WHERE id='approval-a' ON CONFLICT DO NOTHING`, ["b".repeat(64)]);
    expect((await send()).statusCode).toBe(200);
    await db.admin.query(`UPDATE ${S}.approvals SET status='SUPERSEDED', changed_at=clock_timestamp() ${sign} interval '1 day', successor_id='approval-successor' WHERE id='approval-a'`);
    expect(denied(await send())).toEqual(await missingDenial());
    const successor = approvalRequest(); Object.assign(successor.approval, { id: "approval-successor", subjectVersion: "v2", subjectSha256: "b".repeat(64) });
    expect((await send(successor)).statusCode).toBe(200);
  });
  it.each([
    ["tenant", `UPDATE ${S}.tenants SET status='SUSPENDED' WHERE id='tenant-a'`],
    ["campaign", `UPDATE ${S}.campaigns SET status='REVOKED' WHERE id='campaign-a'`],
    ["binding", `SELECT ${S}.change_binding('reader_a',false)`],
    ["grant", `UPDATE ${S}.grants SET status='REVOKED',changed_at=clock_timestamp() WHERE id='reader_a-READ'`]
  ])("C12 every approval request rechecks current %s authority", async (_label, sql) => {
    expect((await send()).statusCode).toBe(200);
    await db.admin.query(sql);
    expect(denied(await send())).toEqual(await missingDenial());
  });
  it("C13 FINANCE is rejected by the HTTP schema", async () => {
    const request = approvalRequest(); request.approval.issuer = "FINANCE";
    expect((await send(request)).statusCode).toBe(400);
  });
  it("C13 a supplied legacy approval object is not trusted", async () => {
    const request = approvalRequest();
    const legacy = { ...request.approval, actor: "writer_a", status: "ACTIVE", scope: request.scope, validFrom: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" };
    expect((await send({ ...request, approval: legacy })).statusCode).toBe(400);
    expect((await send({ ...request, approvals: [legacy] })).statusCode).toBe(400);
  });
  it.each([null, false, true])("C13 rejects audit=%s at every request object level", async audit => {
    const request = approvalRequest();
    for (const payload of [{ ...request, audit }, { ...request, scope: { ...request.scope, audit } }, { ...request, approval: { ...request.approval, audit } }]) {
      expect((await send(payload)).statusCode).toBe(400);
    }
  });
  it.each(["actor", "principal", "role", "capability", "credentialSlot"])("C13 rejects caller-selected %s", async field => {
    expect((await send({ ...approvalRequest(), [field]: "AUDIT" })).statusCode).toBe(400);
  });
  it("C19 successful and failed approval inspections never change any B table", async () => {
    const before = await db.snapshot();
    expect(Object.keys(before)).toHaveLength(6);
    expect((await send()).statusCode).toBe(200);
    await missingDenial();
    const wrong = approvalRequest(); wrong.approval.subjectSha256 = "f".repeat(64);
    denied(await send(wrong));
    expect((await send({ ...approvalRequest(), audit: null })).statusCode).toBe(400);
    denied(await send(approvalRequest(), tokenB));
    expect(await db.snapshot()).toEqual(before);
  });
});
