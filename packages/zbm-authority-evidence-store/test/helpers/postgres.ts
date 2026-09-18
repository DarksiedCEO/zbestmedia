import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
export const IMAGE = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
export const S = "zbm_authority_evidence";
export const capabilities = ["READ", "AUDIT", "MANAGE_TENANT", "MANAGE_GRANT", "RECORD_APPROVAL", "APPEND_EVIDENCE"];
export class Database {
  container!: StartedTestContainer;
  admin!: Client;
  clients: Client[] = [];
  private password = randomBytes(24).toString("hex");
  async start(migrate = true) {
    if (process.version !== "v24.21.0") throw new Error("Node v24.21.0 required");
    this.container = await new GenericContainer(IMAGE).withEnvironment({ POSTGRES_PASSWORD: this.password, POSTGRES_DB: "slice_b" }).withExposedPorts(5432).withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2)).withStartupTimeout(60000).start();
    this.admin = await this.connect("postgres");
    if (migrate && existsSync("sql/provision-roles.sql")) {
      await this.admin.query(readFileSync("sql/provision-roles.sql", "utf8"));
      await this.admin.query(`ALTER ROLE zbm_ae_migrator LOGIN PASSWORD '${this.password}'; GRANT CREATE ON DATABASE slice_b TO zbm_ae_owner`);
      const url = new URL(`postgresql://zbm_ae_migrator:${this.password}@${this.container.getHost()}:${this.container.getMappedPort(5432)}/slice_b`);
      url.searchParams.set("schema", S); url.searchParams.set("options", "-c role=zbm_ae_owner");
      try { execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString(), CHECKPOINT_DISABLE: "1" }, stdio: "pipe" }); }
      catch { throw new Error("Restricted migrator failed; credentials suppressed"); }
    }
    return this;
  }
  async connect(user: string) {
    const c = new Client({ host: this.container.getHost(), port: this.container.getMappedPort(5432), database: "slice_b", user, password: this.password, statement_timeout: 10000, options: "-c lock_timeout=5000" });
    await c.connect(); this.clients.push(c); return c;
  }
  introspect() {
    const url = new URL(`postgresql://zbm_ae_migrator:${this.password}@${this.container.getHost()}:${this.container.getMappedPort(5432)}/slice_b`);
    url.searchParams.set("schema", S); url.searchParams.set("options", "-c role=zbm_ae_owner");
    return execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","pull","--print"],{env:{...process.env,DATABASE_URL:url.toString(),CHECKPOINT_DISABLE:"1"},encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  }
  async seed() {
    await this.admin.query(`INSERT INTO ${S}.tenants(id) VALUES ('tenant-a'),('tenant-b'); INSERT INTO ${S}.campaigns(tenant_id,id) VALUES ('tenant-a','campaign-a'),('tenant-a','campaign-b'),('tenant-b','campaign-c')`);
    for (const [name, tenant, caps, campaign, issuers] of [
      ["writer_a", "tenant-a", capabilities, null, ["RIGHTS"]],
      ["reader_a", "tenant-a", ["READ"], null, []],
      ["reader_b", "tenant-b", ["READ"], null, []],
      ["campaign_a", "tenant-a", ["READ", "APPEND_EVIDENCE", "MANAGE_GRANT"], "campaign-a", []],
      ["auditor_a", "tenant-a", ["AUDIT"], null, []],
      ["unbound", "tenant-a", [], null, []]
    ] as const) {
      await this.admin.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${this.password}'`);
      // Group membership permits EXECUTE through SET ROLE; session_user remains the login.
      const groups = new Set<string>(["reader"]);
      if(caps.some(x=>x==="MANAGE_GRANT"||x==="MANAGE_TENANT")) groups.add("authority_writer");
      if(caps.some(x=>x==="RECORD_APPROVAL")) groups.add("approval_writer");
      if(caps.some(x=>x==="APPEND_EVIDENCE")) groups.add("evidence_writer");
      if(caps.some(x=>x==="AUDIT")) groups.add("auditor");
      for (const group of groups) await this.admin.query(`GRANT zbm_ae_${group} TO ${name}`);
      if (name === "unbound") continue;
      await this.admin.query(`INSERT INTO ${S}.caller_bindings(login,principal,tenant_id,campaign_id,purpose,capabilities,issuers) VALUES($1,$1,$2,$3,'SIMULATION',$4,$5)`, [name,tenant,campaign,caps,issuers]);
      for (const cap of caps) await this.admin.query(`INSERT INTO ${S}.grants(id,tenant_id,campaign_id,scope_kind,principal,purpose,capability,valid_from,expires_at) VALUES($1,$2,$3,$4,$5,'SIMULATION',$6,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')`, [name+"-"+cap,tenant,campaign,campaign ? "CAMPAIGN":"TENANT",name,cap]);
    }
  }
  async runtime(name = "writer_a", group = "authority_writer") { const c = await this.connect(name); await c.query(`SET ROLE zbm_ae_${group}`); return c; }
  async stop() { await Promise.all(this.clients.map(c => c.end().catch(() => undefined))); if(this.container) await this.container.stop(); }
}
export async function call(c: Client, fn: string, values: unknown[]) {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("Invalid test function name");
  return c.query(`SELECT ${S}.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS result`, values);
}
export const observe = (c: Client, tenant="tenant-a", campaign: string|null="campaign-a", capability="READ") => call(c,"observe_authority",[tenant,campaign,"SIMULATION",capability]);
export async function blockedBy(admin: Client, waiting: Client, blocker: Client) {
  const w = (waiting as Client & { processID: number }).processID, b = (blocker as Client & { processID: number }).processID;
  const deadline=Date.now()+4000;
  while(Date.now()<deadline) { const r=await admin.query("SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked",[w,b]); if(r.rows[0].blocked)return; }
  throw new Error("Expected lock wait was not observed");
}
