import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Client, type PoolConfig } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import Fastify from "fastify";
import { resolveServiceAuthConfig } from "@zbest/service-auth";
import { createBoundary } from "../../src/index";

export const S = "zbm_authority_evidence";
export const IMAGE = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
export const route = "/internal/simulation/authority-inspections";
export const tokenA = "fixture-token-a-0123456789";
export const tokenB = "fixture-token-b-0123456789";
export const scopeRequest = (campaign = "campaign-a", tenant = "tenant-a") => ({ kind: "SCOPE_READ", scope: { tenantId: tenant, campaignId: campaign } });
export const approvalRequest = () => ({ kind: "APPROVAL_READ", scope: { tenantId: "tenant-a", campaignId: "campaign-a" }, approval: { id: "approval-a", subjectType: "CUT", subjectId: "cut-a", subjectVersion: "v1", subjectSha256: "a".repeat(64), issuer: "RIGHTS" } });

export class Database {
  container?: StartedTestContainer;
  admin!: Client;
  clients: Client[] = [];
  private password = randomBytes(24).toString("hex");
  async start() {
    if (process.version !== "v24.21.0") throw new Error("Exact Node v24.21.0 required");
    try {
      this.container = await new GenericContainer(IMAGE).withEnvironment({ POSTGRES_PASSWORD: this.password, POSTGRES_DB: "slice_c" }).withExposedPorts(5432).withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2)).withStartupTimeout(60000).start();
      this.admin = await this.connect("postgres");
      const b = resolve("../zbm-authority-evidence-store");
      await this.admin.query(readFileSync(resolve(b, "sql/provision-roles.sql"), "utf8"));
      await this.admin.query(`ALTER ROLE zbm_ae_migrator LOGIN PASSWORD '${this.password}'; GRANT CREATE ON DATABASE slice_c TO zbm_ae_owner`);
      const url = new URL(`postgresql://zbm_ae_migrator:${this.password}@${this.container.getHost()}:${this.container.getMappedPort(5432)}/slice_c`);
      url.searchParams.set("schema", S); url.searchParams.set("options", "-c role=zbm_ae_owner");
      try {
        execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(b, "prisma/schema.prisma")], { env: { ...process.env, DATABASE_URL: url.toString(), CHECKPOINT_DISABLE: "1" }, stdio: "pipe" });
      } catch { throw new Error("Disposable restricted migrator failed; credentials suppressed"); }
      await this.seed();
      return this;
    } catch (e) { await this.stop(); throw e; }
  }
  credentials(user: string): PoolConfig {
    if (!this.container) throw new Error("Container unavailable");
    return { host: this.container.getHost(), port: this.container.getMappedPort(5432), database: "slice_c", user, password: this.password };
  }
  async connect(user: string) {
    const c = new Client(this.credentials(user));
    await c.connect(); this.clients.push(c); c.on("error", () => undefined); return c;
  }
  async seed() {
    await this.admin.query(`INSERT INTO ${S}.tenants(id) VALUES ('tenant-a'),('tenant-b'); INSERT INTO ${S}.campaigns(tenant_id,id) VALUES ('tenant-a','campaign-a'),('tenant-a','campaign-b'),('tenant-b','campaign-c')`);
    const logins = [
      { name: "reader_a", tenant: "tenant-a", campaign: null, caps: ["READ"], groups: ["reader"], issuers: [] },
      { name: "reader_b", tenant: "tenant-b", campaign: null, caps: ["READ"], groups: ["reader"], issuers: [] },
      { name: "campaign_a", tenant: "tenant-a", campaign: "campaign-a", caps: ["READ"], groups: ["reader"], issuers: [] },
      { name: "writer_a", tenant: "tenant-a", campaign: null, caps: ["READ", "MANAGE_TENANT", "MANAGE_GRANT", "RECORD_APPROVAL"], groups: ["reader", "authority_writer", "approval_writer"], issuers: ["RIGHTS"] },
      { name: "unbound", tenant: "tenant-a", campaign: null, caps: [], groups: ["reader"], issuers: [] }
    ];
    for (const l of logins) {
      await this.admin.query(`CREATE ROLE ${l.name} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${this.password}'`);
      for (const group of l.groups) await this.admin.query(`GRANT zbm_ae_${group} TO ${l.name}`);
      if (l.name === "unbound") continue;
      await this.admin.query(`INSERT INTO ${S}.caller_bindings(login,principal,tenant_id,campaign_id,purpose,capabilities,issuers) VALUES($1,$1,$2,$3,'SIMULATION',$4,$5)`, [l.name,l.tenant,l.campaign,l.caps,l.issuers]);
      for (const cap of l.caps) await this.admin.query(`INSERT INTO ${S}.grants(id,tenant_id,campaign_id,scope_kind,principal,purpose,capability,valid_from,expires_at) VALUES($1,$2,$3,$4,$5,'SIMULATION',$6,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')`, [l.name+"-"+cap,l.tenant,l.campaign,l.campaign?"CAMPAIGN":"TENANT",l.name,cap]);
    }
    // Owner-controlled fixture data only, never a runtime authority source.
    await this.admin.query(`INSERT INTO ${S}.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at) VALUES('approval-a','tenant-a','campaign-a','CUT','cut-a','v1',$1,'RIGHTS','writer_a','writer_a',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')`, ["a".repeat(64)]);
  }
  configuration(login = "reader_a", principal = login) {
    return {
      authConfig: resolveServiceAuthConfig(JSON.stringify([
        { keyId: "service-a", token: tokenA, tenants: ["tenant-a"] },
        { keyId: "service-b", token: tokenB, tenants: ["tenant-b"] }
      ])),
      policies: ["service-a","service-b"].map(keyId => ({ keyId, audience: "zbm-command-boundary/simulation" as const, enabled: true, notBefore: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" })),
      bindings: [
        { keyId: "service-a", tenantId: "tenant-a", principal, databaseLogin: login, credentialSlot: "a" },
        { keyId: "service-b", tenantId: "tenant-b", principal: "reader_b", databaseLogin: "reader_b", credentialSlot: "b" }
      ]
    };
  }
  async application(login = "reader_a", principal = login, credentialLogin = login) {
    const boundary = createBoundary(this.configuration(login, principal), { connections: { a: this.credentials(credentialLogin), b: this.credentials("reader_b") } });
    const app = Fastify({ logger: false });
    await app.register(boundary.plugin); await app.ready();
    return { app, close: async () => { await app.close(); await boundary.close(); } };
  }
  async snapshot() {
    const snapshot: Record<string, unknown> = {};
    for (const table of ["tenants","campaigns","caller_bindings","grants","approvals","evidence"]) {
      const q = await this.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${S}.${table} t`);
      snapshot[table] = q.rows[0].rows;
    }
    return snapshot;
  }
  async stop() {
    await Promise.all(this.clients.map(c=>c.end().catch(()=>undefined)));
    if (this.container) { await this.container.stop(); this.container = undefined; }
  }
}
export async function call(c: Client, fn: "set_tenant_status" | "revoke_grant" | "change_binding" | "read_approval", values: unknown[]) {
  return c.query(`SELECT ${S}.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS result`, values);
}
export async function waitForBlock(admin: Client, waiter: string | number, blocker?: number) {
  const until=Date.now()+3500;
  while(Date.now()<until) {
    const r=await admin.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE (usename=$1 OR pid::text=$1) AND array_length(pg_blocking_pids(pid),1)>0",[String(waiter)]);
    const row=r.rows.find((x:{pid:number;blockers:number[]})=>blocker===undefined||x.blockers.includes(blocker));
    if(row)return row.pid as number;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error("Expected PostgreSQL lock blocker not observed");
}
export async function pid(c:Client):Promise<number> { return (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; }
