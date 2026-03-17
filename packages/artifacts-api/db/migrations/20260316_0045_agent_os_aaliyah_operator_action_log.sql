alter table if exists aaliyah_operator_queue
  add column if not exists queue_status text not null default 'active',
  add column if not exists ranking_version integer not null default 1,
  add column if not exists stale_after_at timestamptz,
  add column if not exists canonical_issue_key text,
  add column if not exists superseded_by_queue_item_id text,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_executed_at timestamptz;

update aaliyah_operator_queue
set stale_after_at = coalesce(stale_after_at, evaluated_at + interval '30 minutes')
where stale_after_at is null;

alter table if exists aaliyah_operator_queue
  alter column stale_after_at set not null;

create index if not exists aaliyah_operator_queue_canonical_issue_idx
  on aaliyah_operator_queue (tenant_id, canonical_issue_key, queue_status, priority_score desc);

create table if not exists aaliyah_operator_action_log (
  action_log_id text primary key,
  tenant_id text not null,
  queue_item_id text not null,
  queue_item_version integer not null,
  canonical_issue_key text,
  action_path text not null,
  command_id text,
  founder_actor_id text not null,
  idempotency_key text not null,
  execution_status text not null,
  failure_code text,
  failure_reason text,
  executed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_operator_action_log_queue_item_idx
  on aaliyah_operator_action_log (tenant_id, queue_item_id);

create index if not exists aaliyah_operator_action_log_canonical_issue_idx
  on aaliyah_operator_action_log (tenant_id, canonical_issue_key);

create index if not exists aaliyah_operator_action_log_executed_at_idx
  on aaliyah_operator_action_log (tenant_id, executed_at desc);
