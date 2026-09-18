import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { B, D, Database, command, mustClaim, nextHash, oldHash, scope, waitUntil, type Claim, type Command, type Result } from './helpers/postgres';
import { WorkerChild } from './helpers/worker-child';
import { cleanup, closeApplication, hasExactFields, inject, released, rowFingerprint, RuntimeChild, trace, type Application } from './helpers/system-assurance';

// Neither matcher receives token-bearing rows, even when equality fails.
function expectSameRow(actual: unknown, expected: unknown) {
  expect(isDeepStrictEqual(actual, expected)).toBe(true);
  expect(rowFingerprint(actual)).toBe(rowFingerprint(expected));
}

const modes = ['STATE_ONLY', 'FAKE_RECEIPT'] as const;
const params = (c: Claim) => [scope.tenantId, scope.campaignId, c.operationId, c.epoch, c.token];
const claim = async (child: WorkerChild, recovery = false) => mustClaim(await child.call<Claim | null>(
  recovery ? 'claim_reconciliation' : 'claim_effect', [scope.tenantId, scope.campaignId, randomUUID()]));

describe('Slice E assembled synthetic system assurance (authenticated HTTP + durable workers)', () => {
  const db = new Database();
  beforeAll(() => db.start());
  afterAll(() => db.stop());
  beforeEach(() => db.reset());

  async function accepted(a: Application, req: Command): Promise<Result> {
    const response = await inject(a, req);
    expect(response.statusCode).toBe(req.completion === 'STATE_ONLY' ? 200 : 202);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<Result>();
    expect(body).toMatchObject({ found: true, acceptance: 'ACCEPTED', execution: 'COMPLETED', resultingVersion: '1', replay: false,
      effect: { status: req.completion === 'STATE_ONLY' ? 'NOT_REQUIRED' : 'PENDING', parked: false } });
    return body;
  }
  async function result(a: Application, req: Command): Promise<Result> {
    const response = await inject(a, req, true);
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
    return response.json<Result>();
  }
  async function denied(a: Application, req: Command, lookup = false) {
    const response = await inject(a, req, lookup);
    expect(response.statusCode).toBe(403); expect(response.json().error).toBe('FORBIDDEN');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).not.toHaveProperty('commandId');
    expect(response.json()).not.toHaveProperty('effect');
  }

  it.each(modes)('E01 %s traces authenticated acceptance, committed state/evidence, receipt and replay', async completion => {
    const req = command({ completion }); await db.approve(req);
    const a = await db.application(), worker = new RuntimeChild(db, 'worker_a');
    try {
      const unauthenticated = await inject(a, req, false, false);
      expect(unauthenticated.statusCode).toBe(401);
      expect(await db.counts()).toMatchObject({ commands: 0, accepted: 0, effect_intents: 0 });
      const initial = await accepted(a, req);
      const committed = await trace(db, initial.commandId);
      expect(committed).toMatchObject({ command_id: initial.commandId, version_command_id: initial.commandId,
        version: '1', resulting_version: '1', previous_sha256: oldHash, next_sha256: nextHash,
        payload_sha256: nextHash, next_payload_sha256: nextHash, receipt_id: null, terminal_events: 0,
        acceptance_evidence: { event: 'COMMAND_ACCEPTED', commandId: initial.commandId, identityHash: committed.identity_hash } });
      expect(await db.counts()).toMatchObject({ commands: 1, probe_versions: 1, accepted: 1,
        effect_intents: completion === 'FAKE_RECEIPT' ? 1 : 0, effect_attempts: 0, fake_receipts: 0 });
      const report = await worker.run();
      expect(report).toMatchObject({ reason: 'EMPTY', claims: completion === 'FAKE_RECEIPT' ? 2 : 0 });
      await worker.close(); await released(db, 'worker_a');
      const final = await result(a, req), durable = await trace(db, initial.commandId);
      expect(final).toMatchObject({ commandId: initial.commandId, resultingVersion: '1', effect: {
        status: completion === 'FAKE_RECEIPT' ? 'COMPLETED' : 'NOT_REQUIRED', parked: false } });
      if (completion === 'FAKE_RECEIPT') {
        expect(final.effect.receiptId).toBeTruthy();
        expect(durable).toMatchObject({ receipt_id: final.effect.receiptId, operation_receipt_id: final.effect.receiptId,
          receipt_payload: nextHash, receipt_hash: committed.identity_hash, operation_hash: committed.identity_hash,
          status: 'COMPLETED', dispatch_claims_used: 1, terminal_events: 1 });
        expect(durable.terminal_evidence).toEqual([expect.objectContaining({ event: 'EFFECT_COMPLETED',
          commandId: initial.commandId, operationId: committed.operation_id, identityHash: committed.identity_hash })]);
      } else {
        expect(durable).toMatchObject({ operation_id: null, receipt_id: null, terminal_events: 0, terminal_evidence: [] });
        expect(final.effect).not.toHaveProperty('receiptId');
      }
      const before = await db.counts(), replay = await inject(a, req);
      expect(replay.statusCode).toBe(completion === 'STATE_ONLY' ? 200 : 202);
      expect(replay.json()).toEqual({ ...final, replay: true });
      expect(await db.counts()).toEqual(before); expect(await trace(db, initial.commandId)).toEqual(durable);
    } finally { await cleanup(() => worker.close(), () => closeApplication(a)); }
  });

  it.each(modes)('E02 %s rejects cross-tenant command, lookup and replay without mutations', async completion => {
    const req = command({ completion }); await db.approve(req);
    const a = await db.application(); let foreign: Application | undefined;
    try {
      foreign = await db.application('executor_b');
      const initial = await accepted(a, req), before = await db.counts(), durable = await trace(db, initial.commandId);
      await denied(foreign, req); await denied(foreign, req, true);
      const otherScope = command({ completion, scope: { tenantId: 'tenant-b', campaignId: 'campaign-c' } });
      await denied(a, otherScope); await denied(a, otherScope, true);
      expect(await db.counts()).toEqual(before); expect(await trace(db, initial.commandId)).toEqual(durable);
      expect((await result(a, req)).commandId).toBe(initial.commandId);
    } finally { await cleanup(() => foreign && closeApplication(foreign), () => closeApplication(a)); }
  });

  it.each(modes)('E03 %s permits current READ historical replay after EXECUTE loss, then denies revoked READ', async completion => {
    const req = command({ completion }); await db.approve(req);
    const a = await db.application(), worker = new RuntimeChild(db, 'worker_a');
    try {
      const initial = await accepted(a, req); await worker.run(); await worker.close(); await released(db, 'worker_a');
      const historical = await result(a, req), before = await db.counts(), durable = await trace(db, initial.commandId);
      await db.revoke('EXECUTE_SIMULATION');
      const replay = await inject(a, req);
      expect(replay.statusCode).toBe(completion === 'STATE_ONLY' ? 200 : 202);
      expect(replay.json()).toEqual({ ...historical, replay: true });
      expect(await result(a, req)).toEqual(historical);
      await denied(a, { ...req, idempotencyKey: 'new-key-after-execute-revoked' });
      await db.revoke('READ');
      await denied(a, req); await denied(a, req, true);
      expect(await db.counts()).toEqual(before); expect(await trace(db, initial.commandId)).toEqual(durable);
    } finally { await cleanup(() => worker.close(), () => closeApplication(a)); }
  });

  it.each([false, true])('E04 current worker authority recovery, committed receipt=%s', async receiptCommitted => {
    const a = await db.application(), owner = new WorkerChild(db.credentials('worker_a'));
    const deniedWorker = new RuntimeChild(db, 'worker_a'), replacement = new RuntimeChild(db, 'worker_b');
    try {
      const initial = await accepted(a, command()), c = await claim(owner);
      let receipt: { receiptId: string } | undefined;
      if (receiptCommitted) receipt = await owner.call('dispatch_fake', params(c));
      await db.revoke('PROCESS_SIMULATION', 'worker_a');
      const before = await db.counts();
      await expect(owner.call('dispatch_fake', params(c))).rejects.toMatchObject({ code: '42501' });
      expect(await deniedWorker.run()).toMatchObject({ reason: 'DENIED', claims: 0 });
      expect(await db.counts()).toEqual(before);
      await owner.kill(); await deniedWorker.close(); await released(db, 'worker_a');
      // Accelerated fixture lease expiry only; retain all counters, budgets and production deadlines.
      await db.expire(c.operationId);
      await db.revoke('EXECUTE_SIMULATION'); await db.revokeApproval(); await db.disable('issuer_a');
      expect(await replacement.run()).toMatchObject({ reason: 'EMPTY', claims: 1 });
      await replacement.close(); await released(db, 'worker_b');
      const final = await result(a, command());
      expect(final.commandId).toBe(initial.commandId);
      expect(final.effect).toMatchObject(receiptCommitted ? { status: 'COMPLETED', receiptId: receipt!.receiptId } :
        { status: 'FAILED', reason: 'AUTHORITY_REVOKED_NO_EFFECT' });
      expect(await db.counts()).toMatchObject({ effect_attempts: 1, fake_operations: receiptCommitted ? 1 : 0,
        fake_receipts: receiptCommitted ? 1 : 0, completed: receiptCommitted ? 1 : 0, failed: receiptCommitted ? 0 : 1 });
      expect((await trace(db, initial.commandId)).terminal_events).toBe(1);
      expect((await inject(a, command())).json()).toMatchObject({ commandId: initial.commandId, replay: true, effect: final.effect });
    } finally { await cleanup(() => owner.kill(), () => deniedWorker.close(), () => replacement.close(), () => closeApplication(a)); }
  });

  it('E05 competing child workers produce one effect/terminal outcome and fence the stale owner', async () => {
    const a = await db.application(), old = new WorkerChild(db.credentials('worker_a'));
    const left = new RuntimeChild(db, 'worker_a'), right = new RuntimeChild(db, 'worker_b');
    const takeover = new WorkerChild(db.credentials('worker_b'));
    let blocker: Awaited<ReturnType<Database['connect']>> | undefined;
    let runs: Promise<unknown[]> | undefined;
    try {
      const initial = await accepted(a, command()), stale = await claim(old);
      // Proven absence permits takeover by a newer DISPATCH owner. Production
      // workers then compete to reconcile its receipt. Only lease/due times accelerate.
      await db.expire(stale.operationId);
      const recovery = await claim(takeover, true);
      expect(await takeover.call('reconcile_effect', params(recovery))).toMatchObject({ status: 'PENDING' });
      await db.due(stale.operationId);
      const newer = await claim(takeover);
      const liveOwner = await db.intent(stale.operationId), liveCounts = await db.counts();
      expect(hasExactFields(liveOwner, { status: 'LEASED', owner_kind: 'DISPATCH',
        owner_login: 'worker_b', owner_token: newer.token, dispatch_claims_used: 2, reconcile_slots_used: 0 })).toBe(true);
      expect(BigInt(liveOwner.ownership_epoch)).toBeGreaterThan(BigInt(stale.epoch));
      expect(liveCounts).toMatchObject({ completed: 0, failed: 0, fake_operations: 0, fake_receipts: 0 });
      // Check live authority around EACH stale call: neither expiry nor terminal
      // state may supply the denial. The newer owner retains the exact row.
      const assertLive = async () => {
        const observed = await db.admin.query(`SELECT owner_kind='DISPATCH'
          AND status='LEASED' AND lease_until>clock_timestamp() AS live
          FROM ${D}.effect_intents WHERE operation_id=$1`, [stale.operationId]);
        expect(observed.rows[0].live).toBe(true);
      };
      for (const fn of ['dispatch_fake', 'request_reconciliation']) {
        await assertLive();
        await expect(old.call(fn, params(stale))).rejects.toMatchObject({ code: '42501' });
        await assertLive();
        expectSameRow(await db.intent(stale.operationId), liveOwner);
        expect(await db.counts()).toEqual(liveCounts);
      }
      // The legitimate owner uses exactly that unchanged live claim to commit a
      // receipt and hand off; competing workers then record its terminal outcome.
      const receipt = await takeover.call<{ receiptId: string }>('dispatch_fake', params(newer));
      expect(receipt.receiptId).toBeTruthy();
      await takeover.call('request_reconciliation', params(newer));
      await takeover.kill(); await released(db, 'worker_b');
      expect(await left.started()).not.toBe(await right.started());
      blocker = await db.connect('postgres');
      await blocker.query('BEGIN'); await blocker.query(`SELECT * FROM ${B}.tenants WHERE id='tenant-a' FOR UPDATE`);
      runs = Promise.all([left.run(), right.run()]);
      // Attach rejection handling immediately; the SQL lock barrier, not a sleep, proves overlap.
      void runs.catch(() => undefined);
      await waitUntil(db.admin, `(SELECT count(*) FROM pg_stat_activity WHERE usename IN ('worker_a','worker_b')
        AND application_name='zbm-simulation-runtime' AND cardinality(pg_blocking_pids(pid))>0)=2`);
      await blocker.query('COMMIT');
      const reports = await runs;
      // A contender may see the other's live lease and report NOT_DUE. Neither
      // transport failure nor denial counts as successful contention.
      for (const report of reports) expect(['EMPTY', 'NOT_DUE']).toContain((report as { reason: string }).reason);
      expect(await left.run()).toMatchObject({ reason: 'EMPTY', claims: 0 });
      const before = await db.counts();
      await expect(old.call('dispatch_fake', params(stale))).rejects.toMatchObject({ code: '42501' });
      await expect(old.call('request_reconciliation', params(stale))).rejects.toMatchObject({ code: '42501' });
      expect(await db.counts()).toEqual(before);
      expect(before).toMatchObject({ effect_attempts: 2, fake_operations: 1, fake_receipts: 1, completed: 1, failed: 0 });
      expect((await trace(db, initial.commandId)).terminal_events).toBe(1);
      const durable = await trace(db, initial.commandId);
      expect(durable.receipt_id).toBe(receipt.receiptId);
      expect(durable).toMatchObject({ dispatch_claims_used: 2, dispatch_attempts: 2,
        fake_operation_count: 1, receipt_count: 1, terminal_events: 1, status: 'COMPLETED' });
      expect((await result(a, command())).effect).toMatchObject({ status: 'COMPLETED', receiptId: durable.receipt_id });

      // Distinct pending-effect contention phase: neither SQL fixture dispatches
      // this command. Both production workers must enter claim_effect while no
      // receipt exists. The command-row lock blocks dispatch claims specifically,
      // rather than merely overlapping their initial reconciliation scans.
      const pendingRequest = command({ probeId: 'probe-e05-contention',
        approvalIds: ['approval-e05-contention'], idempotencyKey: 'key-e05-contention' });
      await db.seedProbe(pendingRequest); await db.approve(pendingRequest);
      const pending = await accepted(a, pendingRequest);
      const untouched = await trace(db, pending.commandId);
      expect(untouched).toMatchObject({ status: 'PENDING', dispatch_claims_used: 0,
        dispatch_attempts: 0, fake_operation_count: 0, receipt_count: 0, receipt_id: null, terminal_events: 0 });
      expect(untouched.operation_id).not.toBe(durable.operation_id);
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM ${D}.commands WHERE id=$1 FOR UPDATE`, [pending.commandId]);
      runs = Promise.all([left.run(), right.run()]);
      void runs.catch(() => undefined);
      await waitUntil(db.admin, `(SELECT count(*) FROM pg_stat_activity WHERE usename IN ('worker_a','worker_b')
        AND application_name='zbm-simulation-runtime' AND query LIKE '%claim_effect%'
        AND cardinality(pg_blocking_pids(pid))>0)=2`);
      // Observed overlap precedes any claimed dispatch or committed receipt.
      expect(await trace(db, pending.commandId)).toEqual(untouched);
      await blocker.query('COMMIT');
      for (const report of await runs) expect(['EMPTY', 'NOT_DUE']).toContain((report as { reason: string }).reason);
      expect(await left.run()).toMatchObject({ reason: 'EMPTY', claims: 0 });
      const contended = await trace(db, pending.commandId);
      expect(contended).toMatchObject({ status: 'COMPLETED', dispatch_claims_used: 1, dispatch_attempts: 1,
        fake_operation_count: 1, receipt_count: 1, terminal_events: 1,
        receipt_payload: nextHash, receipt_hash: untouched.identity_hash, operation_hash: untouched.identity_hash });
      expect(contended.receipt_id).toBeTruthy();
      expect(contended.operation_receipt_id).toBe(contended.receipt_id);
      expect(contended.receipt_id).not.toBe(durable.receipt_id);
      expect(contended.terminal_evidence).toEqual([expect.objectContaining({ event: 'EFFECT_COMPLETED',
        commandId: pending.commandId, operationId: untouched.operation_id, identityHash: untouched.identity_hash })]);
      expect((await result(a, pendingRequest)).effect).toMatchObject({ status: 'COMPLETED', receiptId: contended.receipt_id });
      expect(await trace(db, initial.commandId)).toEqual(durable);
      expect(await db.counts()).toMatchObject({ commands: 2, probe_versions: 2, accepted: 2, effect_intents: 2,
        effect_attempts: 3, fake_operations: 2, fake_receipts: 2, completed: 2, failed: 0 });
      await old.kill(); await left.close(); await right.close();
      await released(db, 'worker_a'); await released(db, 'worker_b');
    } finally {
      await cleanup(
        async () => {
          if (blocker) {
            const [rollback] = await Promise.allSettled([blocker.query('ROLLBACK')]);
            await cleanup(() => blocker!.end(), () => {
              if (rollback.status === 'rejected') throw rollback.reason;
            });
          }
        },
        () => old.kill(), () => takeover.kill(), () => left.close(), () => right.close(),
        () => runs, () => closeApplication(a),
      );
    }
  });

  it.each([false, true])('E06 replacement child resumes third durable dispatch after shutdown, receipt=%s', async receiptCommitted => {
    const a = await db.application(); let owner = new WorkerChild(db.credentials('worker_a'));
    const replacement = new RuntimeChild(db, 'worker_b');
    try {
      const initial = await accepted(a, command()); let third!: Claim;
      // Every generation uses a fresh OS process. Explicit absence proof authorizes retry;
      // accelerated fixture due/lease controls never change the three-attempt maximum.
      for (let n = 1; n <= 3; n++) {
        const c = await claim(owner); expect(c.dispatchNumber).toBe(n); third = c;
        if (n < 3) {
          await db.expire(c.operationId); const recovery = await claim(owner, true);
          expect(await owner.call('reconcile_effect', params(recovery))).toMatchObject({ status: 'PENDING' });
          const before = await db.intent(c.operationId);
          await owner.kill(); await released(db, 'worker_a');
          owner = new WorkerChild(db.credentials('worker_a'));
          expectSameRow(await db.intent(c.operationId), before); await db.due(c.operationId);
        }
      }
      let receipt: { receiptId: string } | undefined;
      if (receiptCommitted) receipt = await owner.call('dispatch_fake', params(third));
      const before = await db.intent(third.operationId);
      await owner.kill(); await released(db, 'worker_a');
      await replacement.started(); expectSameRow(await db.intent(third.operationId), before);
      expect(hasExactFields(before, { dispatch_claims_used: 3, owner_login: 'worker_a', owner_token: third.token,
        total_reconcile_claims: 2, reconcile_slots_used: 0 })).toBe(true);
      await db.expire(third.operationId);
      expect(await replacement.run()).toMatchObject({ reason: 'EMPTY', claims: 1 });
      const final = await result(a, command()), row = await db.intent(third.operationId);
      expect(final.effect).toMatchObject(receiptCommitted ? { status: 'COMPLETED', receiptId: receipt!.receiptId } :
        { status: 'FAILED', reason: 'DISPATCH_BUDGET_EXHAUSTED_NO_EFFECT' });
      expect(hasExactFields(row, { dispatch_claims_used: 3, total_reconcile_claims: 3, owner_kind: 'NONE', owner_token: null })).toBe(true);
      expect(BigInt(row.ownership_epoch)).toBeGreaterThan(BigInt(third.epoch));
      expect((await trace(db, initial.commandId)).terminal_events).toBe(1);
      await replacement.close(); await released(db, 'worker_b');
      const next = new RuntimeChild(db, 'worker_a');
      try {
        expect(await next.run()).toMatchObject({ reason: 'EMPTY', claims: 0 });
        expectSameRow(await db.intent(third.operationId), row);
        expect(await db.counts()).toMatchObject({ effect_attempts: 3, fake_operations: receiptCommitted ? 1 : 0,
          fake_receipts: receiptCommitted ? 1 : 0, completed: receiptCommitted ? 1 : 0, failed: receiptCommitted ? 0 : 1 });
      } finally { await cleanup(() => next.close(), () => released(db, 'worker_a')); }
    } finally { await cleanup(() => owner.kill(), () => replacement.close(), () => closeApplication(a)); }
  });

  it('E07 UNKNOWN parking survives child replacement with no counter reset or fourth dispatch', async () => {
    const a = await db.application(); let owner = new WorkerChild(db.credentials('worker_a'));
    try {
      const initial = await accepted(a, command()); let third!: Claim;
      for (let n = 1; n <= 3; n++) {
        third = await claim(owner); expect(third.dispatchNumber).toBe(n);
        await db.expire(third.operationId); // Accelerated fixture lease control.
        if (n < 3) {
          const recovery = await claim(owner, true);
          expect(await owner.call('reconcile_effect', params(recovery))).toMatchObject({ status: 'PENDING' });
          await db.due(third.operationId); // Accelerated fixture due control.
        }
      }
      for (let slot = 1; slot <= 3; slot++) {
        const recovery = await claim(owner, true);
        expect(recovery.dispatchNumber).toBe(3);
        const owned = await db.intent(third.operationId);
        expect(hasExactFields(owned, { owner_token: recovery.token, reconcile_slots_used: slot, dispatch_claims_used: 3 })).toBe(true);
        await owner.kill(); await released(db, 'worker_a');
        owner = new WorkerChild(db.credentials('worker_a'));
        expectSameRow(await db.intent(third.operationId), owned);
        await db.expire(third.operationId);
        const expired = await owner.call('claim_reconciliation', [scope.tenantId, scope.campaignId, randomUUID()]);
        expectSameRow(expired, slot === 3 ? { parked: true, operationId: third.operationId } : null);
        if (slot < 3) await db.due(third.operationId);
      }
      await owner.kill(); await released(db, 'worker_a');
      const parked = await db.intent(third.operationId), counts = await db.counts();
      expect(hasExactFields(parked, { status: 'UNKNOWN_PENDING_RECONCILIATION', parked: true, dispatch_claims_used: 3,
        reconcile_slots_used: 3, expired_reconcile_claims: 3, unsuccessful_reconciliations: 0,
        total_reconcile_claims: 5, total_expired_reconcile_claims: 3, next_dispatch_at: null, next_reconcile_at: null, owner_kind: 'NONE' })).toBe(true);
      expect(counts).toMatchObject({ effect_attempts: 3, fake_operations: 0, fake_receipts: 0, completed: 0, failed: 0 });
      for (const login of ['worker_b', 'worker_a'] as const) {
        const replacement = new RuntimeChild(db, login);
        try {
          expect(await replacement.run()).toMatchObject({ reason: 'EMPTY', claims: 0, parkedCount: 1 });
        } finally { await cleanup(() => replacement.close(), () => released(db, login)); }
        expectSameRow(await db.intent(third.operationId), parked); expect(await db.counts()).toEqual(counts);
      }
      const final = await result(a, command());
      expect(final).toMatchObject({ commandId: initial.commandId, acceptance: 'ACCEPTED', execution: 'COMPLETED',
        effect: { status: 'UNKNOWN_PENDING_RECONCILIATION', parked: true } });
      expect(final.effect).not.toHaveProperty('receiptId');
      const replay = await inject(a, command()); expect(replay.statusCode).toBe(202);
      expect(replay.json()).toEqual({ ...final, replay: true });
      expect(await db.counts()).toEqual(counts); expectSameRow(await db.intent(third.operationId), parked);
      expect((await trace(db, initial.commandId)).terminal_events).toBe(0);
      expect(await db.evidenceCount('RECOVERY_PARKED')).toBe(1);
    } finally { await cleanup(() => owner.kill(), () => closeApplication(a)); }
  });
});
