import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { B, D, Database, bsql, command, mustClaim, sql } from './helpers/postgres';
import {
  BRehearsalDatabase, RestoredDatabase, backupInto, baseMigration,
  dataFingerprint, requireLocalImage, receipt, securityFingerprint, stopBoth,
} from './helpers/backup-restore';

async function histories(db: Database) {
  for (const [schema, owner, names] of [
    [B, 'zbm_ae_owner', [baseMigration, '20260916_000002_simulation_runtime_bridge']],
    [D, 'zbm_sim_owner', ['20260916_000001_simulation_runtime']],
  ] as const) {
    expect((await db.admin.query(`SELECT migration_name FROM ${schema}._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)).rows.map(r => r.migration_name)).toEqual(names);
    expect((await db.admin.query(`SELECT count(*)::int AS n FROM ${schema}._prisma_migrations`)).rows[0].n).toBe(names.length);
    expect((await db.admin.query('SELECT tableowner FROM pg_tables WHERE schemaname=$1 AND tablename=$2', [schema, '_prisma_migrations'])).rows).toEqual([{ tableowner: owner }]);
  }
}

async function evidenceIntegrity(db: Database) {
  const rows = (await db.admin.query(`SELECT *,to_char(appended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS utc_time
    FROM ${B}.evidence ORDER BY tenant_id,campaign_id NULLS FIRST,stream,sequence`)).rows;
  expect(rows.length).toBeGreaterThan(0);
  const chains = new Map<string, { sequence: bigint; hash: string }>();
  for (const row of rows) {
    const key = JSON.stringify([row.tenant_id, row.campaign_id, row.stream]);
    const previous = chains.get(key) ?? { sequence: 0n, hash: '0'.repeat(64) };
    expect(BigInt(row.sequence)).toBe(previous.sequence + 1n);
    expect(row.prior_hash).toBe(previous.hash);
    expect(createHash('sha256').update(row.canonical, 'utf8').digest('hex')).toBe(row.hash);
    const canonical = JSON.parse(row.canonical);
    expect(canonical.slice(0, 12)).toEqual(['zbm-ae-evidence-v1', row.id, row.tenant_id, row.campaign_id,
      row.stream, Number(row.sequence), row.operation, row.predecessor, row.prior_hash, row.actor, row.custodial_login, row.utc_time]);
    chains.set(key, { sequence: BigInt(row.sequence), hash: row.hash });
  }
  return rows.length;
}

it('E migration rehearsal: populated supported B -> B bridge -> repaired D on a fresh database only', async () => {
  const db = new BRehearsalDatabase();
  try {
    await db.startBase();
    expect((await db.admin.query('SHOW server_version')).rows[0].server_version.split(' ')[0]).toBe('16.14');
    expect((await db.admin.query(`SELECT to_regnamespace('${D}') AS d`)).rows[0].d).toBeNull();
    expect((await db.admin.query(`SELECT migration_name FROM ${B}._prisma_migrations`)).rows).toEqual([{ migration_name: baseMigration }]);
    // Representative records really predate the bridge; approval/evidence use B's public API.
    const password = String(db.credentials('postgres').password);
    await db.admin.query(`CREATE ROLE legacy_writer LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      GRANT zbm_ae_approval_writer,zbm_ae_evidence_writer,zbm_ae_reader TO legacy_writer;
      INSERT INTO ${B}.tenants(id) VALUES ('legacy-tenant');
      INSERT INTO ${B}.campaigns(tenant_id,id) VALUES ('legacy-tenant','legacy-campaign');
      INSERT INTO ${B}.caller_bindings(login,principal,tenant_id,purpose,capabilities,issuers)
      VALUES ('legacy_writer','legacy_writer','legacy-tenant','SIMULATION',ARRAY['READ','RECORD_APPROVAL','APPEND_EVIDENCE'],ARRAY['RIGHTS']);`);
    for (const cap of ['READ', 'RECORD_APPROVAL', 'APPEND_EVIDENCE']) await db.admin.query(`INSERT INTO ${B}.grants
      (id,tenant_id,scope_kind,principal,purpose,capability,valid_from,expires_at)
      VALUES ($1,'legacy-tenant','TENANT','legacy_writer','SIMULATION',$2,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`, ['legacy-' + cap, cap]);
    const writer = await db.connect('legacy_writer');
    await bsql(writer, 'record_approval', ['legacy-tenant', 'legacy-campaign', 'SIMULATION', {
      id: 'legacy-approval', subjectType: 'CUT', subjectId: 'legacy-cut', subjectVersion: '1', subjectHash: 'a'.repeat(64),
      issuer: 'RIGHTS', actor: 'legacy_writer', validFrom: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
    }]);
    const evidenceId = await bsql(writer, 'append_evidence', ['legacy-tenant', 'legacy-campaign', 'SIMULATION', 'legacy-stream', { revision: 1 }, null]);
    await bsql(writer, 'append_evidence', ['legacy-tenant', 'legacy-campaign', 'SIMULATION', 'legacy-stream', { revision: 2 }, evidenceId]);
    const before = await dataFingerprint(db, [B], false);
    expect(before[`${B}.approvals`].count).toBe(1);
    expect(before[`${B}.evidence`].count).toBe(3); // Approval event plus a two-entry correction chain.
    await evidenceIntegrity(db);
    const originalHistory = (await db.admin.query(`SELECT * FROM ${B}._prisma_migrations WHERE migration_name=$1`, [baseMigration])).rows;
    db.migrate('B');
    const comparison = await dataFingerprint(db, [B], false);
    receipt('migration-data-comparison', { before, after: comparison });
    expect(comparison).toEqual(before);
    expect((await db.admin.query(`SELECT to_regnamespace('${D}') AS d`)).rows[0].d).toBeNull();
    await db.provisionD();
    db.migrate('D');
    await histories(db);
    expect(await dataFingerprint(db, [B], false)).toEqual(before);
    expect((await db.admin.query(`SELECT * FROM ${B}._prisma_migrations WHERE migration_name=$1`, [baseMigration])).rows).toEqual(originalHistory);
    expect(await bsql(writer, 'read_approval', ['legacy-tenant', 'legacy-campaign', 'SIMULATION', 'legacy-approval', 'CUT', 'legacy-cut', '1', 'a'.repeat(64), 'RIGHTS'])).toMatchObject({ id: 'legacy-approval', actor: 'legacy_writer', status: 'ACTIVE' });
    expect(await bsql(writer, 'read_evidence', ['legacy-tenant', 'legacy-campaign', 'SIMULATION', evidenceId, false])).toMatchObject({ id: evidenceId, sequence: '1', actor: 'legacy_writer' });
    const migrated = await dataFingerprint(db);
    db.migrate('B'); db.migrate('D');
    expect(await dataFingerprint(db)).toEqual(migrated);
    await histories(db);
    await evidenceIntegrity(db);
    const dMigrator = await db.connect('zbm_sim_migrator');
    await dMigrator.query('SET ROLE zbm_sim_owner');
    await expect(dMigrator.query(`ALTER TABLE ${B}.tenants ADD COLUMN unauthorized text`)).rejects.toMatchObject({ code: '42501' });
    await expect(dMigrator.query('SET ROLE zbm_ae_owner')).rejects.toMatchObject({ code: '42501' });
  } finally {
    try { await db.stop(); } finally { receipt('migration-container-cleanup', { removed: !db.container }); }
  }
}, 180000);

async function counters(db: Database, operationId: string) {
  return (await db.admin.query(`SELECT dispatch_claims_used,ownership_epoch::text,owner_kind,reconcile_slots_used,
    total_reconcile_claims,total_unsuccessful_reconciliations,total_expired_reconcile_claims,status
    FROM ${D}.effect_intents WHERE operation_id=$1`, [operationId])).rows[0];
}

it('E synthetic PG16 backup restores roles, owners, grants, histories and durable state before authorized continuation', async () => {
  const source = new Database(), restored = new RestoredDatabase(source);
  try {
    requireLocalImage();
    await source.start();
    const accepted = await source.submit();
    // Completed receipt plus a second operation with nonzero durable retry counters.
    const completedClaim = mustClaim(await source.claim());
    const completedReceipt = await source.dispatch(completedClaim);
    await source.handoff(completedClaim);
    expect(await source.reconcile(mustClaim(await source.recover()))).toMatchObject({ status: 'COMPLETED', receiptId: completedReceipt.receiptId });
    const pending = command({ probeId: 'restore-pending', approvalIds: ['restore-approval'], idempotencyKey: 'restore-key' });
    await source.seedProbe(pending); await source.approve(pending); await source.submit(pending);
    const stale = mustClaim(await source.claim());
    await source.expire(stale.operationId);
    expect(await source.reconcile(mustClaim(await source.recover()))).toMatchObject({ status: 'PENDING', reason: 'NO_EFFECT_RETRY' });
    await source.due(stale.operationId);
    const durable = await counters(source, stale.operationId);
    expect(durable).toEqual({ dispatch_claims_used: 1, ownership_epoch: '2', owner_kind: 'NONE', reconcile_slots_used: 1,
      total_reconcile_claims: 1, total_unsuccessful_reconciliations: 0, total_expired_reconcile_claims: 0, status: 'PENDING' });
    expect(await source.counts()).toMatchObject({ commands: 2, probe_versions: 2, effect_intents: 2, effect_attempts: 2,
      fake_operations: 1, fake_receipts: 1, accepted: 2, completed: 1, failed: 0 });
    expect((await source.admin.query(`SELECT identity_hash FROM ${D}.commands WHERE id=$1`, [accepted.commandId])).rows).toEqual([{ identity_hash: 'd3370a54c956324b29fd816294325f11d68ec8e6eeaba0425fa530580de3d4d1' }]);
    const evidenceId = (await source.admin.query(`SELECT id FROM ${B}.evidence WHERE stream='simulation-runtime-v1' ORDER BY sequence LIMIT 1`)).rows[0].id;
    const data = await dataFingerprint(source), security = await securityFingerprint(source);
    const evidenceCount = await evidenceIntegrity(source);
    await restored.startEmpty();
    expect(restored.container!.getId()).not.toBe(source.container!.getId());
    await backupInto(source, restored);
    expect((await restored.admin.query('SHOW server_version')).rows[0].server_version.split(' ')[0]).toBe('16.14');
    const restoredData = await dataFingerprint(restored);
    receipt('restore-data-comparison', { before: data, after: restoredData });
    expect(restoredData).toEqual(data);
    const restoredSecurity = await securityFingerprint(restored);
    receipt('restore-security-comparison', { matched: Object.keys(security).filter(key => security[key] === restoredSecurity[key]), mismatched: Object.keys(security).filter(key => security[key] !== restoredSecurity[key]) });
    expect(restoredSecurity).toEqual(security);
    const restoredEvidenceCount = await evidenceIntegrity(restored);
    receipt('restore-evidence-chain', { before: evidenceCount, after: restoredEvidenceCount, verified: true });
    expect(restoredEvidenceCount).toBe(evidenceCount);
    await histories(restored);
    expect(await counters(restored, stale.operationId)).toEqual(durable);
    // Public logins authenticate with restored password verifiers and retain scoped identity.
    for (const login of ['executor_a', 'reader_a', 'worker_a']) {
      const client = await restored.connect(login);
      expect((await client.query('SELECT session_user,current_user')).rows).toEqual([{ session_user: login, current_user: login }]);
      expect(await sql(client, 'observe_runtime_principal', ['tenant-a', 'campaign-a'])).toEqual({ principal: login, login, tenant: 'tenant-a', campaign: 'campaign-a' });
      await expect(sql(client, 'observe_runtime_principal', ['tenant-b', 'campaign-c'])).rejects.toMatchObject({ code: '42501' });
      for (const query of [`SELECT * FROM ${D}.commands`, `UPDATE ${D}.effect_intents SET dispatch_claims_used=0`,
        `DELETE FROM ${B}.evidence`, `CREATE TABLE ${D}.unauthorized(id int)`, 'SET ROLE zbm_sim_owner',
        'SET ROLE zbm_sim_migrator', 'SET ROLE zbm_ae_reader', 'SET ROLE zbm_ae_simulation_bridge']) {
        await expect(client.query(query)).rejects.toMatchObject({ code: '42501' });
      }
      await expect(bsql(client, 'read_evidence', ['tenant-a', 'campaign-a', 'SIMULATION', evidenceId, false])).rejects.toMatchObject({ code: '42501' });
      await expect(sql(client, 'seed_probe', ['tenant-a', 'campaign-a', 'unauthorized', 'a'.repeat(64)])).rejects.toMatchObject({ code: '42501' });
      await expect(bsql(client, 'read_approval', ['tenant-a', 'campaign-a', 'SIMULATION', 'approval-a', 'SIMULATION_PROBE_TRANSITION_V1', 'probe-a', '0', await restored.transitionHash(command()), 'TECHNICAL_QC'])).rejects.toMatchObject({ code: '42501' });
    }
    for (const role of ['zbm_sim_executor', 'zbm_sim_result_reader', 'zbm_sim_worker']) expect((await restored.admin.query("SELECT pg_has_role($1,'zbm_ae_reader','MEMBER') AS allowed", [role])).rows[0].allowed).toBe(false);
    await expect(sql(await restored.connect('unbound'), 'observe_runtime_principal', ['tenant-a', 'campaign-a'])).rejects.toMatchObject({ code: '42501' });
    await expect(restored.result(command(), 'executor_other')).rejects.toMatchObject({ code: '42501' });
    await expect(restored.result(command(), 'executor_b')).rejects.toMatchObject({ code: '42501' });
    expect(await bsql(await restored.connect('issuer_a'), 'read_approval', ['tenant-a', 'campaign-a', 'SIMULATION', 'approval-a', 'SIMULATION_PROBE_TRANSITION_V1', 'probe-a', '0', await restored.transitionHash(command()), 'TECHNICAL_QC'])).toMatchObject({ id: 'approval-a', actor: 'issuer_a' });
    expect(await bsql(await restored.connect('auditor_a'), 'read_evidence', ['tenant-a', 'campaign-a', 'SIMULATION', evidenceId, true])).toMatchObject({ id: evidenceId, actor: 'executor_a', custodial_login: 'executor_a', sequence: '1' });
    expect(await restored.submit()).toMatchObject({ commandId: accepted.commandId, replay: true, effect: { status: 'COMPLETED', receiptId: completedReceipt.receiptId } });
    await expect(restored.submit(command({ nextPayloadSha256: 'c'.repeat(64) }))).rejects.toMatchObject({ code: 'P0002' });
    await expect(restored.dispatch(stale)).rejects.toMatchObject({ code: '42501' });
    expect(await dataFingerprint(restored)).toEqual(data); // Denials and replay perform no durable writes.
    const next = mustClaim(await restored.claim());
    expect([next.operationId, next.epoch, next.dispatchNumber, next.kind]).toEqual([stale.operationId, '3', 2, 'DISPATCH']);
    const nextReceipt = await restored.dispatch(next);
    await restored.handoff(next);
    expect(await restored.reconcile(mustClaim(await restored.recover()))).toMatchObject({ status: 'COMPLETED', receiptId: nextReceipt.receiptId });
    expect(nextReceipt.receiptId).not.toBe(completedReceipt.receiptId);
    const links = (await restored.admin.query(`SELECT c.id AS command_id,i.identity_hash=f.identity_hash AND f.identity_hash=r.identity_hash AS identity_matches,
      f.receipt_id=r.id AND i.receipt_id=r.id AS receipt_matches,r.id AS receipt_id
      FROM ${D}.commands c JOIN ${D}.effect_intents i ON i.command_id=c.id
      JOIN ${D}.fake_operations f ON f.operation_id=i.operation_id JOIN ${D}.fake_receipts r ON r.operation_id=i.operation_id ORDER BY c.id`)).rows;
    expect(links).toHaveLength(2);
    expect(links.every(row => row.identity_matches && row.receipt_matches)).toBe(true);
    expect(links.find(row => row.command_id === accepted.commandId)?.receipt_id).toBe(completedReceipt.receiptId);
    expect(await restored.counts()).toMatchObject({ commands: 2, probe_versions: 2, effect_intents: 2, effect_attempts: 3,
      fake_operations: 2, fake_receipts: 2, accepted: 2, completed: 2, failed: 0 });
    expect(await counters(restored, stale.operationId)).toMatchObject({ dispatch_claims_used: 2, ownership_epoch: '4',
      total_reconcile_claims: 2, total_unsuccessful_reconciliations: 0, total_expired_reconcile_claims: 0, status: 'COMPLETED' });
    expect(await restored.version(pending)).toBe('1');
    expect(await restored.result(pending)).toMatchObject({ effect: { status: 'COMPLETED', receiptId: nextReceipt.receiptId } });
    const continuedEvidenceCount = await evidenceIntegrity(restored);
    receipt('authorized-continuation', { counts: await restored.counts(), counters: await counters(restored, stale.operationId), evidenceBefore: evidenceCount, evidenceAfter: continuedEvidenceCount, chainVerified: true });
    expect(continuedEvidenceCount).toBeGreaterThan(evidenceCount);
    // Separate from the successful continuation: a current owner must still obey current B authority.
    const revokedRequest = command({ probeId: 'restore-revoked', approvalIds: ['restore-revoked-approval'], idempotencyKey: 'restore-revoked-key' });
    await restored.seedProbe(revokedRequest); await restored.approve(revokedRequest);
    const revokedAccepted = await restored.submit(revokedRequest);
    const current = mustClaim(await restored.claim());
    expect([current.epoch, current.dispatchNumber, current.kind]).toEqual(['1', 1, 'DISPATCH']);
    const currentWorker = await restored.connect('worker_a');
    const inspectCurrent = async () => (await sql<{ current: boolean }>(currentWorker, 'inspect_worker_claim',
      ['tenant-a', 'campaign-a', current.token])).current;
    expect(await inspectCurrent()).toBe(true);
    await restored.revoke('EXECUTE_SIMULATION'); // B revoke_grant as manager_a; emits its own authority evidence.
    expect((await restored.admin.query(`SELECT status,version FROM ${B}.grants WHERE id='executor_a-EXECUTE_SIMULATION'`)).rows)
      .toEqual([{ status: 'REVOKED', version: 1 }]);
    const afterRevocation = await dataFingerprint(restored);
    expect(await inspectCurrent()).toBe(true);
    await expect(restored.dispatch(current)).rejects.toMatchObject({ code: '42501' });
    expect(await inspectCurrent()).toBe(true); // Rules out lease expiry or stale ownership as the denial cause.
    const afterDeniedDispatch = await dataFingerprint(restored);
    receipt('restored-current-authority-denial', { claimStillCurrent: true, sqlstate: '42501', before: afterRevocation, after: afterDeniedDispatch });
    expect(afterDeniedDispatch).toEqual(afterRevocation);
    // PROCESS remains authorized: handoff requires the same still-valid dispatch claim.
    await restored.handoff(current);
    const recovery = mustClaim(await restored.recover());
    expect([recovery.operationId, recovery.epoch, recovery.kind]).toEqual([current.operationId, '2', 'RECONCILE']);
    expect(await restored.reconcile(recovery)).toMatchObject({ status: 'FAILED', reason: 'AUTHORITY_REVOKED_NO_EFFECT', parked: false });
    expect(await restored.result(revokedRequest)).toMatchObject({ commandId: revokedAccepted.commandId,
      effect: { status: 'FAILED', reason: 'AUTHORITY_REVOKED_NO_EFFECT' } });
    expect(await restored.counts()).toMatchObject({ commands: 3, probe_versions: 3, effect_intents: 3, effect_attempts: 4,
      fake_operations: 2, fake_receipts: 2, accepted: 3, completed: 2, failed: 1 });
    expect(await counters(restored, current.operationId)).toEqual({ dispatch_claims_used: 1, ownership_epoch: '2',
      owner_kind: 'NONE', reconcile_slots_used: 1, total_reconcile_claims: 1, total_unsuccessful_reconciliations: 0,
      total_expired_reconcile_claims: 0, status: 'FAILED' });
    const finalEvidenceCount = await evidenceIntegrity(restored);
    expect(finalEvidenceCount).toBeGreaterThan(continuedEvidenceCount);
    receipt('restored-current-authority-recovery', { status: 'FAILED', reason: 'AUTHORITY_REVOKED_NO_EFFECT',
      counts: await restored.counts(), evidenceCount: finalEvidenceCount, chainVerified: true });
    expect(await dataFingerprint(source)).toEqual(data); // Continuation cannot mutate the original database.
  } finally { await stopBoth(source, restored); }
}, 240000);
