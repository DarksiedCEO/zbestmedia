import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GenericContainer, Wait } from 'testcontainers';
import type { PoolConfig } from 'pg';
import { B, D, Database, IMAGE } from './postgres';

const socket = 'unix:///Users/andrelove/.docker/run/docker.sock';
const backupDirectory = '/tmp/slice-e-backup';
export const baseMigration = '20260914_000001_authority_evidence_spine';

export function receipt(phase: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ marker: 'SLICE_E_BACKUP_RESTORE', phase, ...fields }));
}
function exitCode(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}
/** Never surface child argv, stderr, role password hashes, or connection URLs. */
function docker(args: string[]): string {
  const phase = ['pg_dumpall', 'pg_dump', 'pg_restore', 'psql', 'rm', 'mkdir', 'cp', 'image'].find(x => args.includes(x)) ?? 'container-directory-setup';
  try {
    const result = execFileSync('docker', args, {
      env: { ...process.env, DOCKER_HOST: socket }, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    });
    receipt(phase, { exitCode: 0 });
    return result;
  } catch (error) {
    const status = exitCode(error);
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');
    const postgresErrors = [...stderr.matchAll(/psql:[^\r\n]*?:(\d+): (?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/g)]
      .map(match => ({ line: Number(match[1]), sqlstate: match[2] }));
    const errorClasses = [
      ['permission-denied-to-grant-role', /permission denied to grant role/],
      ['grantor-must-have-admin-option', /grantor must have the ADMIN option/],
      ['only-admin-option-may-grant-role', /Only roles with the ADMIN option/],
      ['grantor-must-be-current-user', /grantor must be current user/],
      ['permission-denied', /permission denied/],
    ].filter(([,pattern]) => (pattern as RegExp).test(stderr)).map(([label]) => label);
    receipt(phase, { exitCode: status, failed: true, postgresErrors, errorClasses });
    throw new Error(`Slice E ${phase} failed (exit ${status ?? 'unavailable'}); sensitive diagnostics suppressed`);
  }
}
export function requireLocalImage() {
  if (process.version !== 'v24.21.0') throw new Error('Exact Node v24.21.0 required');
  if (execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim() !== '9.15.0') throw new Error('Exact pnpm 9.15.0 required');
  if (process.env.DOCKER_HOST !== socket) throw new Error('Explicit disposable Docker socket required');
  if (process.env.TESTCONTAINERS_RYUK_DISABLED !== 'true') throw new Error('Disable Ryuk: only the existing pinned PostgreSQL image is authorized');
  // Inspect only: fail before Testcontainers can attempt to pull a missing image.
  docker(['image', 'inspect', IMAGE]);
}

/** Fresh B-only database: deliberately does not call Database.start(), which deploys D. */
export class BRehearsalDatabase extends Database {
  async startBase() {
    requireLocalImage();
    try {
      this.container = await new GenericContainer(IMAGE)
        .withPullPolicy({ shouldPull: () => false })
        .withEnvironment({ POSTGRES_PASSWORD: this.rehearsalPassword, POSTGRES_DB: 'slice_d' })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .withStartupTimeout(60000).start();
      this.admin = await this.connect('postgres');
      await this.admin.query(readFileSync(resolve('../zbm-authority-evidence-store/sql/provision-roles.sql'), 'utf8'));
      const password = String(this.credentials('postgres').password);
      await this.admin.query(`ALTER ROLE zbm_ae_migrator LOGIN PASSWORD '${password}'; GRANT CREATE ON DATABASE slice_d TO zbm_ae_owner`);
      const migrator = await this.connect('zbm_ae_migrator');
      await migrator.query(readFileSync(resolve(`../zbm-authority-evidence-store/prisma/migrations/${baseMigration}/migration.sql`), 'utf8'));
      this.migrate('B', ['migrate', 'resolve', '--applied', baseMigration]);
      return this;
    } catch { await this.stop(); throw new Error('Fresh B rehearsal initialization failed; diagnostics suppressed'); }
  }
  // Own password for this subclass, without exposing or editing Database's private state.
  private readonly rehearsalPassword = randomBytes(24).toString('hex');
  override credentials(user: string): PoolConfig {
    return { ...super.credentials(user), password: this.rehearsalPassword };
  }
  async provisionD() {
    await this.admin.query(readFileSync(resolve('sql/provision-roles.sql'), 'utf8'));
    const password = String(this.credentials('postgres').password);
    await this.admin.query(`ALTER ROLE zbm_sim_migrator LOGIN PASSWORD '${password}'; GRANT CREATE ON DATABASE slice_d TO zbm_sim_owner`);
  }
  override migrate(owner: 'B' | 'D', args = ['migrate', 'deploy']) {
    const user = owner === 'B' ? 'zbm_ae_migrator' : 'zbm_sim_migrator';
    const credentials = this.credentials(user);
    const url = new URL(`postgresql://${user}:${this.rehearsalPassword}@${credentials.host}:${credentials.port}/slice_d`);
    url.searchParams.set('schema', owner === 'B' ? B : D);
    url.searchParams.set('options', `-c role=${owner === 'B' ? 'zbm_ae_owner' : 'zbm_sim_owner'}`);
    try {
      const output = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), ...args, '--schema',
        resolve(owner === 'B' ? '../zbm-authority-evidence-store/prisma/schema.prisma' : 'prisma/schema.prisma')], {
        env: { ...process.env, DATABASE_URL: url.toString(), CHECKPOINT_DISABLE: '1' },
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
      });
      receipt('migration', { owner, action: args[1], exitCode: 0 });
      return output;
    } catch (error) {
      const status = exitCode(error);
      receipt('migration', { owner, action: args[1], exitCode: status, failed: true });
      throw new Error(`Slice E ${owner} migration failed (exit ${status ?? 'unavailable'}); sensitive diagnostics suppressed`);
    }
  }
}

/** Fresh cluster retains the source bootstrap grantor identity for PG16 role memberships. */
export class RestoredDatabase extends Database {
  constructor(private readonly source: Database) { super(); }
  override credentials(user: string): PoolConfig {
    const own = super.credentials(user);
    return { ...own, password: this.source.credentials(user).password };
  }
  async startEmpty() {
    requireLocalImage();
    this.container = await new GenericContainer(IMAGE)
      .withPullPolicy({ shouldPull: () => false })
      .withEnvironment({ POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: randomBytes(24).toString('hex'), POSTGRES_DB: 'postgres' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60000).start();
  }
}
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Hash full rows to avoid printing tokens, canonical payloads, or password material on failures. */
export async function dataFingerprint(db: Database, schemas = [B, D], includeHistory = true) {
  const tables = (await db.admin.query(`SELECT schemaname,tablename FROM pg_tables
    WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,tablename`, [schemas])).rows;
  const result: Record<string, { count: number; sha256: string }> = {};
  for (const { schemaname, tablename } of tables) {
    if (!includeHistory && tablename === '_prisma_migrations') continue;
    const rows = (await db.admin.query(`SELECT to_jsonb(t)::text AS row FROM ${quote(schemaname)}.${quote(tablename)} t ORDER BY to_jsonb(t)::text COLLATE "C"`)).rows;
    result[`${schemaname}.${tablename}`] = { count: rows.length, sha256: digest(rows) };
  }
  return result;
}

/** OID-independent inventory includes owners, effective ACLs, defaults and PG16 membership options.
 * pg_dump omits explicit ACLs equal to acldefault; NULL is that default, not an empty grant set.
 * Expand and sort ACL entries without dropping any grantee, grantor, privilege or grant option. */
export async function securityFingerprint(db: Database) {
  const queries = {
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig
      FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname`,
    memberships: `SELECT r.rolname AS role,m.rolname AS member,g.rolname AS grantor,a.admin_option,a.inherit_option,a.set_option
      FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor
      WHERE r.rolname !~ '^pg_' ORDER BY 1,2,3`,
    schemas: `SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text FROM pg_namespace WHERE nspname IN ('${B}','${D}') ORDER BY 1`,
    relations: `SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
      ARRAY(SELECT acl::text FROM unnest(coalesce(c.relacl,
        CASE WHEN c.relkind='S' THEN acldefault('s',c.relowner)
          WHEN c.relkind IN ('r','p','v','m','f') THEN acldefault('r',c.relowner) END)) acl ORDER BY acl::text) AS relacl,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('${B}','${D}') ORDER BY 1,2`,
    functions: `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner) AS owner,p.proacl::text,p.prosecdef,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('${B}','${D}') ORDER BY 1,2,3`,
    defaults: `SELECT pg_get_userbyid(d.defaclrole) AS owner,coalesce(n.nspname,'') AS schema,d.defaclobjtype,d.defaclacl::text
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3`,
    database: `SELECT datname,pg_get_userbyid(datdba) AS owner,datacl::text FROM pg_database WHERE datname='slice_d'`,
  };
  const result: Record<string, string> = {};
  for (const [name, query] of Object.entries(queries)) {
    const rows = (await db.admin.query(query)).rows;
    result[name] = digest(rows);
  }
  return result;
}

/** Caller owns both fixtures and must stop both in finally, including after a partial restore. */
export async function backupInto(source: Database, target: RestoredDatabase) {
  if (!source.container || !target.container || source.container.getId() === target.container.getId()) throw new Error('Two isolated containers required');
  const from = source.container.getId(), to = target.container.getId();
  const temporary = mkdtempSync(join(tmpdir(), 'slice-e-sensitive-'));
  chmodSync(temporary, 0o700);
  let snapshotOpen = false;
  let operationFailed = false;
  let operationError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // No application/worker is running. Close every fixture session except the snapshot owner;
    // reject an unexpected external session. No source mutation is permitted until this returns.
    await Promise.all(source.clients.filter(c => c !== source.admin).map(c => c.end()));
    source.clients = [source.admin];
    const active = await source.admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()`);
    receipt('source-quiescence', { otherDatabaseSessions: active.rows[0].n, backgroundWorkersStarted: 0 });
    if (active.rows[0].n !== 0) throw new Error('Source is not quiescent');
    await source.admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    snapshotOpen = true;
    const snapshot = (await source.admin.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot as string;
    docker(['exec', '-u', 'postgres', from, 'sh', '-c', `umask 077; mkdir ${backupDirectory}`]);
    // Globals have no MVCC snapshot; fixture-wide quiescence also freezes role/membership DDL.
    docker(['exec', '-u', 'postgres', from, 'pg_dumpall', '-U', 'postgres', '--roles-only', '--file', `${backupDirectory}/roles.sql`]);
    docker(['exec', '-u', 'postgres', from, 'pg_dump', '-U', 'postgres', '-d', 'slice_d', '--format=custom', '--create', `--snapshot=${snapshot}`, '--file', `${backupDirectory}/database.dump`]);
    await source.admin.query('COMMIT'); snapshotOpen = false;
    docker(['cp', `${from}:${backupDirectory}/roles.sql`, join(temporary, 'roles.sql')]);
    docker(['cp', `${from}:${backupDirectory}/database.dump`, join(temporary, 'database.dump')]);
    for (const name of ['roles.sql', 'database.dump']) chmodSync(join(temporary, name), 0o600);
    docker(['exec', to, 'mkdir', '-m', '700', backupDirectory]);
    // pg_dumpall includes the existing bootstrap role declaration. Keep its ALTER ROLE
    // (including password verifier) and every GRANT/GRANTED BY clause byte-for-byte.
    const rolesPath = join(temporary, 'roles.sql');
    const roles = readFileSync(rolesPath, 'utf8');
    const bootstrapDeclarations = roles.match(/^CREATE ROLE postgres;$/gm) ?? [];
    if (bootstrapDeclarations.length !== 1) throw new Error('Expected exactly one bootstrap role declaration');
    const bootstrap = docker(['exec', to, 'psql', '-XAt', '-U', 'postgres', '-d', 'postgres',
      '-c', "SELECT oid=10 AND rolsuper FROM pg_roles WHERE rolname='postgres'"]).trim();
    if (bootstrap !== 't') throw new Error('Destination bootstrap grantor identity mismatch');
    writeFileSync(rolesPath, roles.replace(/^CREATE ROLE postgres;$/m, '-- Existing bootstrap role postgres; ALTER ROLE and memberships follow unchanged.'), { mode: 0o600 });
    receipt('bootstrap-role-restore', { existingBootstrapGrantorVerified: true, redundantCreateStatementsOmitted: 1, attributesAndMembershipsRetained: true });
    docker(['cp', join(temporary, 'roles.sql'), `${to}:${backupDirectory}/roles.sql`]);
    docker(['cp', join(temporary, 'database.dump'), `${to}:${backupDirectory}/database.dump`]);
    // Restore owners and grants as recorded: intentionally no --no-owner or --no-acl.
    docker(['exec', to, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=verbose', '--file', `${backupDirectory}/roles.sql`]);
    docker(['exec', to, 'pg_restore', '-U', 'postgres', '--exit-on-error', '--create', '--dbname=postgres', `${backupDirectory}/database.dump`]);
    target.admin = await target.connect('postgres');
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    if (snapshotOpen) {
      try { await source.admin.query('ROLLBACK'); }
      catch (error) { cleanupErrors.push(error); }
    }
    const cleanup = await Promise.allSettled([
      Promise.resolve().then(() => {
        rmSync(temporary, { recursive: true, force: true });
        receipt('host-sensitive-backup-cleanup', { removed: !existsSync(temporary) });
      }),
      ...[from, to].map(async id => docker(['exec', id, 'rm', '-rf', backupDirectory])),
    ]);
    receipt('sensitive-backup-cleanup', { host: cleanup[0].status, source: cleanup[1].status, destination: cleanup[2].status });
    for (const result of cleanup) if (result.status === 'rejected') cleanupErrors.push(result.reason);
  }
  // Report outside finally: retain both the original failure and every cleanup failure.
  if (cleanupErrors.length) {
    const error = new Error('Sensitive backup cleanup failed' + (operationFailed ? ' after backup/restore failure' : ''));
    throw Object.assign(error, { operationError, cleanupErrors });
  }
  if (operationFailed) throw operationError;
}

export async function stopBoth(source: Database, target: Database) {
  const outcomes = await Promise.allSettled([source.stop(), target.stop()]);
  receipt('owned-container-cleanup', { source: outcomes[0].status, destination: outcomes[1].status, remainingOwnedContainers: Number(Boolean(source.container)) + Number(Boolean(target.container)) });
  if (outcomes.some(r => r.status === 'rejected')) throw new Error('Slice E container cleanup failed');
}
