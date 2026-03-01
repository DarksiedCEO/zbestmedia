import { Pool } from "pg";

import type { LoadRunSloEvent } from "../schema";

export async function emitLoadRunSloEventToPostgres(args: {
  event: LoadRunSloEvent;
  postgresUrl: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: args.postgresUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.slo_loadrun_events (
        event_id text PRIMARY KEY,
        ts timestamptz NOT NULL,
        source text NOT NULL,
        service text NOT NULL,
        passed boolean NOT NULL,
        payload jsonb NOT NULL
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_slo_loadrun_events_ts ON public.slo_loadrun_events (ts DESC);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_slo_loadrun_events_source ON public.slo_loadrun_events (source);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_slo_loadrun_events_passed ON public.slo_loadrun_events (passed);");

    await client.query(
      `
      INSERT INTO public.slo_loadrun_events (event_id, ts, source, service, passed, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (event_id) DO NOTHING
      `,
      [args.event.event_id, args.event.ts, args.event.source, args.event.service, args.event.verdict.passed, JSON.stringify(args.event)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
