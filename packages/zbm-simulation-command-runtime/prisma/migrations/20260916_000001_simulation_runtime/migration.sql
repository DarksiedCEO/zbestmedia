SET ROLE zbm_sim_owner;
CREATE SCHEMA IF NOT EXISTS zbm_simulation_runtime AUTHORIZATION zbm_sim_owner;
REVOKE ALL ON SCHEMA zbm_simulation_runtime FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE zbm_simulation_runtime.probes (
 tenant_id text NOT NULL, campaign_id text NOT NULL, id text NOT NULL,
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0), payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,campaign_id,id),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES zbm_authority_evidence.campaigns(tenant_id,id),
 CHECK(id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$')
);
-- B retains ownership; D owner inherits only column-scoped REFERENCES via its bridge.
CREATE TABLE zbm_simulation_runtime.commands (
 id uuid PRIMARY KEY, environment text NOT NULL CHECK(environment='SIMULATION'),
 tenant_id text NOT NULL, campaign_id text NOT NULL, principal text NOT NULL, requester_login text NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
 probe_id text NOT NULL, canonical text NOT NULL, identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),
 request jsonb NOT NULL, transition_hash text NOT NULL CHECK(transition_hash ~ '^[a-f0-9]{64}$'), approval_ids text[] NOT NULL,
 resulting_version bigint NOT NULL CHECK(resulting_version>0), next_payload_sha256 text NOT NULL,
 evidence_id text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(environment,tenant_id,campaign_id,principal,idempotency_key),
 UNIQUE(tenant_id,campaign_id,id),
 FOREIGN KEY(tenant_id,campaign_id,evidence_id) REFERENCES zbm_authority_evidence.evidence(tenant_id,campaign_id,id),
 CHECK(next_payload_sha256 ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(tenant_id,campaign_id,probe_id) REFERENCES zbm_simulation_runtime.probes(tenant_id,campaign_id,id),
 CHECK(identity_hash=encode(sha256(convert_to(canonical,'UTF8')),'hex'))
);
CREATE TABLE zbm_simulation_runtime.probe_versions (
 tenant_id text NOT NULL,campaign_id text NOT NULL,probe_id text NOT NULL,version bigint NOT NULL CHECK(version>0),
 previous_sha256 text NOT NULL,next_sha256 text NOT NULL,command_id uuid NOT NULL UNIQUE,
 PRIMARY KEY(tenant_id,campaign_id,probe_id,version),
 FOREIGN KEY(tenant_id,campaign_id,probe_id) REFERENCES zbm_simulation_runtime.probes(tenant_id,campaign_id,id),
 FOREIGN KEY(tenant_id,campaign_id,command_id) REFERENCES zbm_simulation_runtime.commands(tenant_id,campaign_id,id),
 CHECK(previous_sha256 ~ '^[a-f0-9]{64}$' AND next_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE zbm_simulation_runtime.effect_intents (
 operation_id uuid PRIMARY KEY,command_id uuid NOT NULL UNIQUE,
 tenant_id text NOT NULL,campaign_id text NOT NULL,
 kind text NOT NULL DEFAULT 'FAKE_RECEIPT' CHECK(kind='FAKE_RECEIPT'),
 identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),canonical text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','LEASED','UNKNOWN_PENDING_RECONCILIATION','COMPLETED','FAILED')),
 dispatch_claims_used integer NOT NULL DEFAULT 0 CHECK(dispatch_claims_used BETWEEN 0 AND 3),
 ownership_epoch bigint NOT NULL DEFAULT 0 CHECK(ownership_epoch>=0),
 owner_kind text NOT NULL DEFAULT 'NONE' CHECK(owner_kind IN ('NONE','DISPATCH','RECONCILE')),
 owner_login text,owner_token uuid,lease_until timestamptz,
 reconcile_slots_used integer NOT NULL DEFAULT 0 CHECK(reconcile_slots_used BETWEEN 0 AND 3),
 unsuccessful_reconciliations integer NOT NULL DEFAULT 0 CHECK(unsuccessful_reconciliations BETWEEN 0 AND 3),
 expired_reconcile_claims integer NOT NULL DEFAULT 0 CHECK(expired_reconcile_claims BETWEEN 0 AND 3),
 total_reconcile_claims integer NOT NULL DEFAULT 0 CHECK(total_reconcile_claims BETWEEN 0 AND 9),
 total_unsuccessful_reconciliations integer NOT NULL DEFAULT 0 CHECK(total_unsuccessful_reconciliations BETWEEN 0 AND 9),
 total_expired_reconcile_claims integer NOT NULL DEFAULT 0 CHECK(total_expired_reconcile_claims BETWEEN 0 AND 9),
 next_dispatch_at timestamptz DEFAULT clock_timestamp(),next_reconcile_at timestamptz,
 parked boolean NOT NULL DEFAULT false,park_reason text,reason text,receipt_id uuid,
 UNIQUE(tenant_id,campaign_id,operation_id),
 FOREIGN KEY(tenant_id,campaign_id,command_id) REFERENCES zbm_simulation_runtime.commands(tenant_id,campaign_id,id),
 CHECK((owner_kind='NONE' AND owner_login IS NULL AND owner_token IS NULL AND lease_until IS NULL) OR
       (owner_kind<>'NONE' AND owner_login IS NOT NULL AND owner_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((status='COMPLETED')=(receipt_id IS NOT NULL)),
 CHECK(lease_until IS NULL OR isfinite(lease_until)),
 CHECK(NOT parked OR (status='UNKNOWN_PENDING_RECONCILIATION' AND owner_kind='NONE' AND next_dispatch_at IS NULL AND next_reconcile_at IS NULL)),
 CHECK(identity_hash=encode(sha256(convert_to(canonical,'UTF8')),'hex'))
);
CREATE INDEX effect_due ON zbm_simulation_runtime.effect_intents(tenant_id,campaign_id,status,next_dispatch_at,next_reconcile_at,lease_until) WHERE NOT parked;
CREATE TABLE zbm_simulation_runtime.effect_attempts (
 operation_id uuid NOT NULL REFERENCES zbm_simulation_runtime.effect_intents(operation_id),dispatch_number integer NOT NULL CHECK(dispatch_number BETWEEN 1 AND 3),
 ownership_epoch bigint NOT NULL CHECK(ownership_epoch>0),owner_login text NOT NULL,attempt_uuid uuid NOT NULL UNIQUE,claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,dispatch_number),UNIQUE(operation_id,ownership_epoch),UNIQUE(operation_id,ownership_epoch,attempt_uuid)
);
CREATE TABLE zbm_simulation_runtime.attempt_events (
 id bigint GENERATED ALWAYS AS IDENTITY,
 tenant_id text NOT NULL,campaign_id text NOT NULL,
 operation_id uuid NOT NULL REFERENCES zbm_simulation_runtime.effect_intents(operation_id),ownership_epoch bigint NOT NULL,
 dispatch_generation integer NOT NULL CHECK(dispatch_generation BETWEEN 1 AND 3),reconcile_slot integer NOT NULL CHECK(reconcile_slot BETWEEN 0 AND 3),
 event_kind text NOT NULL CHECK(event_kind IN ('DISPATCH_CLAIMED','RECONCILE_CLAIMED','RECONCILE_EXPIRED','RECONCILE_UNRESOLVED','RETRY_SCHEDULED','EFFECT_COMPLETED','EFFECT_FAILED','RECOVERY_PARKED')),owner_login text NOT NULL,owner_token uuid,reason text,evidence_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,id),
 FOREIGN KEY(tenant_id,campaign_id,operation_id) REFERENCES zbm_simulation_runtime.effect_intents(tenant_id,campaign_id,operation_id),
 FOREIGN KEY(tenant_id,campaign_id,evidence_id) REFERENCES zbm_authority_evidence.evidence(tenant_id,campaign_id,id),
 UNIQUE(operation_id,ownership_epoch,event_kind)
);
CREATE UNIQUE INDEX unique_claim_token ON zbm_simulation_runtime.attempt_events(owner_token) WHERE event_kind IN ('DISPATCH_CLAIMED','RECONCILE_CLAIMED');
CREATE UNIQUE INDEX one_terminal ON zbm_simulation_runtime.attempt_events(operation_id) WHERE event_kind IN ('EFFECT_COMPLETED','EFFECT_FAILED');
CREATE UNIQUE INDEX one_reconcile_slot_event ON zbm_simulation_runtime.attempt_events(operation_id,dispatch_generation,reconcile_slot,event_kind) WHERE event_kind IN ('RECONCILE_CLAIMED','RECONCILE_EXPIRED','RECONCILE_UNRESOLVED');
CREATE TABLE zbm_simulation_runtime.fake_operations (
 operation_id uuid PRIMARY KEY REFERENCES zbm_simulation_runtime.effect_intents(operation_id),tenant_id text NOT NULL,campaign_id text NOT NULL,
 identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),canonical text NOT NULL,ownership_epoch bigint NOT NULL CHECK(ownership_epoch>0),attempt_uuid uuid NOT NULL,receipt_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(tenant_id,campaign_id,operation_id) REFERENCES zbm_simulation_runtime.effect_intents(tenant_id,campaign_id,operation_id),
 UNIQUE(tenant_id,campaign_id,operation_id,receipt_id),
 FOREIGN KEY(operation_id,ownership_epoch,attempt_uuid) REFERENCES zbm_simulation_runtime.effect_attempts(operation_id,ownership_epoch,attempt_uuid),
 CHECK(identity_hash=encode(sha256(convert_to(canonical,'UTF8')),'hex'))
);
CREATE TABLE zbm_simulation_runtime.fake_receipts (
 id uuid PRIMARY KEY,operation_id uuid NOT NULL UNIQUE REFERENCES zbm_simulation_runtime.fake_operations(operation_id),
 tenant_id text NOT NULL,campaign_id text NOT NULL,identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),ownership_epoch bigint NOT NULL CHECK(ownership_epoch>0),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,campaign_id,operation_id,id),
 FOREIGN KEY(tenant_id,campaign_id,operation_id,id) REFERENCES zbm_simulation_runtime.fake_operations(tenant_id,campaign_id,operation_id,receipt_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,campaign_id,operation_id) REFERENCES zbm_simulation_runtime.effect_intents(tenant_id,campaign_id,operation_id)
);
ALTER TABLE zbm_simulation_runtime.fake_operations ADD CONSTRAINT fake_receipt_link FOREIGN KEY(tenant_id,campaign_id,operation_id,receipt_id) REFERENCES zbm_simulation_runtime.fake_receipts(tenant_id,campaign_id,operation_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE zbm_simulation_runtime.effect_intents ADD CONSTRAINT intent_receipt_link FOREIGN KEY(tenant_id,campaign_id,operation_id,receipt_id) REFERENCES zbm_simulation_runtime.fake_receipts(tenant_id,campaign_id,operation_id,id);

CREATE FUNCTION zbm_simulation_runtime.immutable_record() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable record'; END $$;
CREATE TRIGGER command_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.commands FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();
CREATE TRIGGER version_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.probe_versions FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();
CREATE TRIGGER attempt_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.effect_attempts FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();
CREATE TRIGGER event_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.attempt_events FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();
CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.fake_operations FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON zbm_simulation_runtime.fake_receipts FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.immutable_record();

CREATE FUNCTION zbm_simulation_runtime._request(r jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE k text;v text;
BEGIN
 IF r IS NULL OR jsonb_typeof(r)<>'object' OR
 r-ARRAY['kind','contractVersion','scope','probeId','expectedVersion','expectedPayloadSha256','nextPayloadSha256','completion','approvalIds','idempotencyKey']<>'{}'::jsonb OR
 r->>'kind' IS DISTINCT FROM 'ADVANCE_SIMULATION_PROBE' OR r->'contractVersion' IS DISTINCT FROM '1'::jsonb OR
 jsonb_typeof(r->'scope') IS DISTINCT FROM 'object' OR (r->'scope')-ARRAY['tenantId','campaignId']<>'{}'::jsonb OR
 r->>'completion' IS NULL OR r->>'completion' NOT IN ('STATE_ONLY','FAKE_RECEIPT') OR
 jsonb_typeof(r->'approvalIds') IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request'; END IF;
 IF jsonb_array_length(r->'approvalIds')<>1 OR jsonb_typeof(r->'approvalIds'->0) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid approvals'; END IF;
 FOREACH k IN ARRAY ARRAY['probeId','idempotencyKey','expectedVersion','expectedPayloadSha256','nextPayloadSha256','completion'] LOOP
 IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid field'; END IF;
 END LOOP;
 FOREACH v IN ARRAY ARRAY[r->>'probeId',r->>'idempotencyKey',r->'scope'->>'tenantId',r->'scope'->>'campaignId',r->'approvalIds'->>0] LOOP
 IF v IS NULL OR NOT v ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identifier'; END IF;
 END LOOP;
 IF jsonb_typeof(r->'scope'->'tenantId') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'scope'->'campaignId') IS DISTINCT FROM 'string' OR
 length(r->>'idempotencyKey')>128 OR NOT(r->>'expectedVersion' ~ '^(0|[1-9][0-9]{0,18})$') OR
 (r->>'expectedVersion')::numeric>9223372036854775807 OR NOT(r->>'expectedPayloadSha256' ~ '^[a-f0-9]{64}$') OR NOT(r->>'nextPayloadSha256' ~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid field'; END IF;
END $$;
CREATE FUNCTION zbm_simulation_runtime._ids(r jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(r->'approvalIds') $$;
CREATE FUNCTION zbm_simulation_runtime._transition(r jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
SELECT encode(sha256(convert_to(jsonb_build_array('zbm-sim-transition-v1',r->'scope'->>'tenantId',r->'scope'->>'campaignId',r->>'probeId',r->>'expectedVersion',r->>'expectedPayloadSha256',r->>'nextPayloadSha256',r->>'completion')::text,'UTF8')),'hex') $$;
CREATE FUNCTION zbm_simulation_runtime._canonical(r jsonb,p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
SELECT jsonb_build_array('zbm-sim-command-v1','SIMULATION',r->'scope'->>'tenantId',r->'scope'->>'campaignId',p,r->>'kind',1,r->>'probeId',r->>'expectedVersion',r->>'expectedPayloadSha256',r->>'nextPayloadSha256',r->>'completion',to_jsonb(zbm_simulation_runtime._ids(r)))::text $$;
CREATE FUNCTION zbm_simulation_runtime._key(t text,c text,p text,k text) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array('zbm-sim-replay-v1',t,c,p,k)::text,0)) $$;
CREATE FUNCTION zbm_simulation_runtime._result(cmd zbm_simulation_runtime.commands,is_replay boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE i zbm_simulation_runtime.effect_intents;e jsonb;
BEGIN
 SELECT * INTO i FROM zbm_simulation_runtime.effect_intents WHERE command_id=cmd.id;
 IF FOUND THEN e:=jsonb_strip_nulls(jsonb_build_object('status',i.status,'parked',i.parked,'receiptId',i.receipt_id,'reason',i.reason));
 ELSE e:=jsonb_build_object('status','NOT_REQUIRED','parked',false); END IF;
 RETURN jsonb_build_object('found',true,'commandId',cmd.id,'acceptance','ACCEPTED','execution','COMPLETED','resultingVersion',cmd.resulting_version::text,'probeId',cmd.probe_id,'replay',is_replay,'effect',e);
END $$;
CREATE FUNCTION zbm_simulation_runtime.seed_probe(t text,c text,pid text,digest text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Owner-only fixture/bootstrap. Authority fixture must already exist; no runtime grant.
 IF NOT coalesce(t ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' AND c ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' AND pid ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$',false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid scope'; END IF;
 INSERT INTO zbm_simulation_runtime.probes(tenant_id,campaign_id,id,payload_sha256) VALUES(t,c,pid,digest);
END $$;
CREATE FUNCTION zbm_simulation_runtime.submit_or_replay(r jsonb,lookup_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t text;c text;b jsonb;can text;ih text;th text;cmd zbm_simulation_runtime.commands;pr zbm_simulation_runtime.probes;cid uuid:=gen_random_uuid();eid text;op uuid;
BEGIN
 IF NOT (pg_has_role(session_user,'zbm_sim_executor','MEMBER') OR pg_has_role(session_user,'zbm_sim_result_reader','MEMBER')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM zbm_simulation_runtime._request(r);
 IF lookup_only IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lookup mode'; END IF;
 t:=r->'scope'->>'tenantId';c:=r->'scope'->>'campaignId';
 IF NOT lookup_only THEN PERFORM zbm_authority_evidence.lock_simulation_scope(t,c,'COMMAND',session_user::text,zbm_simulation_runtime._ids(r)); END IF;
 b:=zbm_authority_evidence.authorize_simulation_read(t,c);
 PERFORM zbm_simulation_runtime._key(t,c,b->>'principal',r->>'idempotencyKey');
 can:=zbm_simulation_runtime._canonical(r,b->>'principal');ih:=encode(sha256(convert_to(can,'UTF8')),'hex');
 SELECT * INTO cmd FROM zbm_simulation_runtime.commands WHERE environment='SIMULATION' AND tenant_id=t AND campaign_id=c AND principal=b->>'principal' AND idempotency_key=r->>'idempotencyKey' FOR UPDATE;
 IF FOUND THEN
  IF cmd.canonical IS DISTINCT FROM can OR cmd.identity_hash IS DISTINCT FROM ih THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Command conflict'; END IF;
  RETURN zbm_simulation_runtime._result(cmd,true);
 END IF;
 IF lookup_only THEN RETURN jsonb_build_object('found',false); END IF;
 SELECT * INTO pr FROM zbm_simulation_runtime.probes WHERE tenant_id=t AND campaign_id=c AND id=r->>'probeId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 th:=zbm_simulation_runtime._transition(r);
 b:=zbm_authority_evidence.authorize_simulation_transition(t,c,'COMMAND',session_user::text,pr.id,r->>'expectedVersion',th,zbm_simulation_runtime._ids(r));
 IF pr.version::text IS DISTINCT FROM r->>'expectedVersion' OR pr.payload_sha256 IS DISTINCT FROM r->>'expectedPayloadSha256' OR pr.payload_sha256=r->>'nextPayloadSha256' OR pr.version=9223372036854775807 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='State conflict'; END IF;
 UPDATE zbm_simulation_runtime.probes SET version=version+1,payload_sha256=r->>'nextPayloadSha256' WHERE tenant_id=t AND campaign_id=c AND id=pr.id AND version=pr.version AND payload_sha256=pr.payload_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='State conflict'; END IF;
 eid:=zbm_authority_evidence.append_simulation_evidence(t,c,'COMMAND',jsonb_build_object('event','COMMAND_ACCEPTED','commandId',cid::text,'identityHash',ih));
 INSERT INTO zbm_simulation_runtime.commands(id,environment,tenant_id,campaign_id,principal,requester_login,idempotency_key,probe_id,canonical,identity_hash,request,transition_hash,approval_ids,resulting_version,next_payload_sha256,evidence_id)
 VALUES(cid,'SIMULATION',t,c,b->>'principal',session_user::text,r->>'idempotencyKey',pr.id,can,ih,r,th,zbm_simulation_runtime._ids(r),pr.version+1,r->>'nextPayloadSha256',eid) RETURNING * INTO cmd;
 INSERT INTO zbm_simulation_runtime.probe_versions VALUES(t,c,pr.id,pr.version+1,pr.payload_sha256,r->>'nextPayloadSha256',cid);
 IF r->>'completion'='FAKE_RECEIPT' THEN
 op:=gen_random_uuid();INSERT INTO zbm_simulation_runtime.effect_intents(operation_id,command_id,tenant_id,campaign_id,identity_hash,canonical) VALUES(op,cid,t,c,ih,can);
 END IF;
 RETURN zbm_simulation_runtime._result(cmd,false);
END $$;
CREATE FUNCTION zbm_simulation_runtime.read_own_result(t text,c text,idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;cmd zbm_simulation_runtime.commands;
BEGIN
 IF NOT (pg_has_role(session_user,'zbm_sim_executor','MEMBER') OR pg_has_role(session_user,'zbm_sim_result_reader','MEMBER')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF idempotency_key IS NULL OR idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid key'; END IF;
 b:=zbm_authority_evidence.authorize_simulation_read(t,c);
 PERFORM zbm_simulation_runtime._key(t,c,b->>'principal',idempotency_key);
 SELECT * INTO cmd FROM zbm_simulation_runtime.commands WHERE environment='SIMULATION' AND tenant_id=t AND campaign_id=c AND principal=b->>'principal' AND commands.idempotency_key=read_own_result.idempotency_key;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 RETURN zbm_simulation_runtime._result(cmd,true);
END $$;

-- Private helpers. Runtime roles receive only the enumerated public entry points below.
CREATE FUNCTION zbm_simulation_runtime._worker(t text,c text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT pg_has_role(session_user,'zbm_sim_worker','MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM zbm_authority_evidence.authorize_simulation_process(t,c);
END $$;
CREATE FUNCTION zbm_simulation_runtime._lock_intent(t text,c text,op uuid) RETURNS zbm_simulation_runtime.effect_intents LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE cmd zbm_simulation_runtime.commands;i zbm_simulation_runtime.effect_intents;
BEGIN
 SELECT x.* INTO cmd FROM zbm_simulation_runtime.commands x JOIN zbm_simulation_runtime.effect_intents e ON e.command_id=x.id AND e.tenant_id=x.tenant_id AND e.campaign_id=x.campaign_id WHERE e.tenant_id=t AND e.campaign_id=c AND e.operation_id=op;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM zbm_simulation_runtime._key(t,c,cmd.principal,cmd.idempotency_key);
 PERFORM 1 FROM zbm_simulation_runtime.commands WHERE tenant_id=t AND campaign_id=c AND id=cmd.id FOR UPDATE;
 SELECT * INTO i FROM zbm_simulation_runtime.effect_intents WHERE tenant_id=t AND campaign_id=c AND operation_id=op FOR UPDATE;
 IF NOT FOUND OR i.canonical IS DISTINCT FROM cmd.canonical OR i.identity_hash IS DISTINCT FROM cmd.identity_hash THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Effect identity conflict'; END IF;
 RETURN i;
END $$;
CREATE FUNCTION zbm_simulation_runtime._fresh_token(tok uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF tok IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Claim token required'; END IF;
 IF EXISTS(SELECT 1 FROM zbm_simulation_runtime.attempt_events WHERE owner_token=tok AND event_kind IN ('DISPATCH_CLAIMED','RECONCILE_CLAIMED')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Claim token already used'; END IF;
END $$;
CREATE FUNCTION zbm_simulation_runtime._owner(i zbm_simulation_runtime.effect_intents,ep bigint,tok uuid,k text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ep IS NULL OR tok IS NULL OR i.ownership_epoch IS DISTINCT FROM ep OR i.owner_token IS DISTINCT FROM tok OR i.owner_login IS DISTINCT FROM session_user::text OR i.owner_kind IS DISTINCT FROM k OR i.lease_until IS NULL OR i.lease_until<=clock_timestamp() OR i.parked OR i.status IN ('COMPLETED','FAILED') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Ownership unavailable'; END IF;
END $$;
CREATE FUNCTION zbm_simulation_runtime._claim_json(i zbm_simulation_runtime.effect_intents) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operationId',i.operation_id,'epoch',i.ownership_epoch::text,'token',i.owner_token,'kind',i.owner_kind,'dispatchNumber',i.dispatch_claims_used,'leaseUntil',i.lease_until)
$$;
CREATE FUNCTION zbm_simulation_runtime._effect_json(i zbm_simulation_runtime.effect_intents) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('status',i.status,'parked',i.parked,'reason',i.reason,'receiptId',i.receipt_id))
$$;
CREATE FUNCTION zbm_simulation_runtime._event(i zbm_simulation_runtime.effect_intents,kind text,why text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE eid text;p text;
BEGIN
 SELECT principal INTO p FROM zbm_simulation_runtime.commands WHERE tenant_id=i.tenant_id AND campaign_id=i.campaign_id AND id=i.command_id;
 eid:=zbm_authority_evidence.append_simulation_evidence(i.tenant_id,i.campaign_id,'PROCESS',jsonb_strip_nulls(jsonb_build_object('event',kind,'commandId',i.command_id::text,'operationId',i.operation_id::text,'reason',why,'ownershipEpoch',i.ownership_epoch::text,'dispatchNumber',i.dispatch_claims_used,'requesterPrincipal',p,'identityHash',i.identity_hash)));
 INSERT INTO zbm_simulation_runtime.attempt_events(tenant_id,campaign_id,operation_id,ownership_epoch,dispatch_generation,reconcile_slot,event_kind,owner_login,owner_token,reason,evidence_id)
 VALUES(i.tenant_id,i.campaign_id,i.operation_id,i.ownership_epoch,i.dispatch_claims_used,i.reconcile_slots_used,kind,session_user::text,i.owner_token,why,eid);
END $$;
CREATE FUNCTION zbm_simulation_runtime.intent_identity_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.operation_id,NEW.command_id,NEW.tenant_id,NEW.campaign_id,NEW.kind,NEW.identity_hash,NEW.canonical) IS DISTINCT FROM (OLD.operation_id,OLD.command_id,OLD.tenant_id,OLD.campaign_id,OLD.kind,OLD.identity_hash,OLD.canonical) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable effect identity'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER intent_identity BEFORE UPDATE ON zbm_simulation_runtime.effect_intents FOR EACH ROW EXECUTE FUNCTION zbm_simulation_runtime.intent_identity_immutable();

CREATE FUNCTION zbm_simulation_runtime.claim_effect(t text,c text,claim_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op uuid;i zbm_simulation_runtime.effect_intents;dt timestamptz;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c); PERFORM zbm_simulation_runtime._fresh_token(claim_token);
 SELECT operation_id INTO op FROM zbm_simulation_runtime.effect_intents WHERE tenant_id=t AND campaign_id=c AND NOT parked AND status='PENDING' AND owner_kind='NONE' AND dispatch_claims_used<3 AND next_dispatch_at<=clock_timestamp() ORDER BY next_dispatch_at,operation_id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 i:=zbm_simulation_runtime._lock_intent(t,c,op);dt:=clock_timestamp();
 IF i.parked OR i.status<>'PENDING' OR i.owner_kind<>'NONE' OR i.dispatch_claims_used>=3 OR i.next_dispatch_at IS NULL OR i.next_dispatch_at>dt THEN RETURN NULL; END IF;
 IF i.dispatch_claims_used>0 AND NOT EXISTS(SELECT 1 FROM zbm_simulation_runtime.attempt_events WHERE operation_id=op AND dispatch_generation=i.dispatch_claims_used AND event_kind='RETRY_SCHEDULED') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Absence proof required'; END IF;
 IF i.ownership_epoch=9223372036854775807 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fence exhausted'; END IF;
 UPDATE zbm_simulation_runtime.effect_intents SET dispatch_claims_used=dispatch_claims_used+1,ownership_epoch=ownership_epoch+1,owner_kind='DISPATCH',owner_login=session_user::text,owner_token=claim_token,lease_until=dt+interval '10 seconds',status='LEASED',next_dispatch_at=NULL,next_reconcile_at=NULL,reconcile_slots_used=0,unsuccessful_reconciliations=0,expired_reconcile_claims=0,reason=NULL WHERE operation_id=op RETURNING * INTO i;
 INSERT INTO zbm_simulation_runtime.effect_attempts(operation_id,dispatch_number,ownership_epoch,owner_login,attempt_uuid,claimed_at) VALUES(op,i.dispatch_claims_used,i.ownership_epoch,session_user::text,claim_token,dt);
 PERFORM zbm_simulation_runtime._event(i,'DISPATCH_CLAIMED');
 RETURN zbm_simulation_runtime._claim_json(i);
END $$;

CREATE FUNCTION zbm_simulation_runtime.dispatch_fake(t text,c text,operation_id uuid,epoch bigint,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cmd zbm_simulation_runtime.commands;i zbm_simulation_runtime.effect_intents;f zbm_simulation_runtime.fake_operations;r zbm_simulation_runtime.fake_receipts;rid uuid;attempt uuid;
BEGIN
 IF NOT pg_has_role(session_user,'zbm_sim_worker','MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 -- Immutable hint only: prepare the COMPLETE binding set before taking any tenant lock.
 SELECT x.* INTO cmd FROM zbm_simulation_runtime.commands x JOIN zbm_simulation_runtime.effect_intents e ON e.command_id=x.id AND e.tenant_id=x.tenant_id AND e.campaign_id=x.campaign_id WHERE e.tenant_id=t AND e.campaign_id=c AND e.operation_id=dispatch_fake.operation_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM zbm_authority_evidence.lock_simulation_scope(t,c,'DISPATCH',cmd.requester_login,cmd.approval_ids);
 i:=zbm_simulation_runtime._lock_intent(t,c,operation_id);
 PERFORM zbm_authority_evidence.authorize_simulation_transition(t,c,'DISPATCH',cmd.requester_login,cmd.probe_id,cmd.request->>'expectedVersion',cmd.transition_hash,cmd.approval_ids);
 PERFORM zbm_simulation_runtime._owner(i,epoch,token,'DISPATCH');
 SELECT attempt_uuid INTO attempt FROM zbm_simulation_runtime.effect_attempts a WHERE a.operation_id=i.operation_id AND a.dispatch_number=i.dispatch_claims_used AND a.ownership_epoch=epoch AND a.owner_login=session_user::text AND a.attempt_uuid=token;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Attempt unavailable'; END IF;
 SELECT * INTO f FROM zbm_simulation_runtime.fake_operations x WHERE x.tenant_id=t AND x.campaign_id=c AND x.operation_id=i.operation_id;
 IF FOUND THEN
  SELECT * INTO r FROM zbm_simulation_runtime.fake_receipts x WHERE x.tenant_id=t AND x.campaign_id=c AND x.operation_id=i.operation_id;
  IF r.id IS NULL OR f.canonical IS DISTINCT FROM i.canonical OR f.identity_hash IS DISTINCT FROM i.identity_hash OR r.identity_hash IS DISTINCT FROM i.identity_hash OR r.id IS DISTINCT FROM f.receipt_id OR f.ownership_epoch IS DISTINCT FROM epoch OR r.ownership_epoch IS DISTINCT FROM epoch OR f.attempt_uuid IS DISTINCT FROM attempt OR r.payload_sha256 IS DISTINCT FROM cmd.next_payload_sha256 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Receipt identity conflict'; END IF;
  RETURN jsonb_build_object('receiptId',r.id,'operationId',i.operation_id);
 END IF;
 IF EXISTS(SELECT 1 FROM zbm_simulation_runtime.fake_receipts x WHERE x.tenant_id=t AND x.campaign_id=c AND x.operation_id=i.operation_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Receipt identity conflict'; END IF;
 rid:=gen_random_uuid();
 INSERT INTO zbm_simulation_runtime.fake_operations(operation_id,tenant_id,campaign_id,identity_hash,canonical,ownership_epoch,attempt_uuid,receipt_id) VALUES(i.operation_id,t,c,i.identity_hash,i.canonical,epoch,attempt,rid);
 INSERT INTO zbm_simulation_runtime.fake_receipts(id,operation_id,tenant_id,campaign_id,identity_hash,ownership_epoch,payload_sha256) VALUES(rid,i.operation_id,t,c,i.identity_hash,epoch,cmd.next_payload_sha256);
 RETURN jsonb_build_object('receiptId',rid,'operationId',i.operation_id);
END $$;

CREATE FUNCTION zbm_simulation_runtime.request_reconciliation(t text,c text,operation_id uuid,epoch bigint,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i zbm_simulation_runtime.effect_intents;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c);i:=zbm_simulation_runtime._lock_intent(t,c,operation_id);
 PERFORM zbm_simulation_runtime._owner(i,epoch,token,'DISPATCH');
 UPDATE zbm_simulation_runtime.effect_intents SET status='UNKNOWN_PENDING_RECONCILIATION',owner_kind='NONE',owner_login=NULL,owner_token=NULL,lease_until=NULL,next_dispatch_at=NULL,next_reconcile_at=clock_timestamp() WHERE effect_intents.operation_id=i.operation_id;
 RETURN NULL;
END $$;

CREATE FUNCTION zbm_simulation_runtime.claim_reconciliation(t text,c text,claim_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op uuid;i zbm_simulation_runtime.effect_intents;dt timestamptz;park boolean;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c);PERFORM zbm_simulation_runtime._fresh_token(claim_token);
 SELECT operation_id INTO op FROM zbm_simulation_runtime.effect_intents WHERE tenant_id=t AND campaign_id=c AND NOT parked AND status IN ('LEASED','UNKNOWN_PENDING_RECONCILIATION') AND dispatch_claims_used>0 AND
 ((owner_kind<>'NONE' AND lease_until<=clock_timestamp()) OR (owner_kind='NONE' AND next_reconcile_at<=clock_timestamp())) ORDER BY coalesce(lease_until,next_reconcile_at),operation_id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 i:=zbm_simulation_runtime._lock_intent(t,c,op);dt:=clock_timestamp();
 IF i.parked OR i.status NOT IN ('LEASED','UNKNOWN_PENDING_RECONCILIATION') OR (i.owner_kind<>'NONE' AND i.lease_until>dt) OR (i.owner_kind='NONE' AND (i.next_reconcile_at IS NULL OR i.next_reconcile_at>dt)) THEN RETURN NULL; END IF;
 IF i.owner_kind='RECONCILE' THEN
  -- Expiry is an unfinished reservation, not a completed unsuccessful observation.
  PERFORM zbm_simulation_runtime._event(i,'RECONCILE_EXPIRED','RECONCILIATION_LEASE_EXPIRED');park:=i.reconcile_slots_used>=3;
  IF park THEN PERFORM zbm_simulation_runtime._event(i,'RECOVERY_PARKED','RECONCILIATION_BUDGET_EXHAUSTED'); END IF;
  UPDATE zbm_simulation_runtime.effect_intents SET expired_reconcile_claims=expired_reconcile_claims+1,total_expired_reconcile_claims=total_expired_reconcile_claims+1,status='UNKNOWN_PENDING_RECONCILIATION',owner_kind='NONE',owner_login=NULL,owner_token=NULL,lease_until=NULL,next_dispatch_at=NULL,next_reconcile_at=CASE WHEN park THEN NULL ELSE dt+CASE WHEN i.reconcile_slots_used=1 THEN interval '1 second' ELSE interval '5 seconds' END END,parked=park,park_reason=CASE WHEN park THEN 'RECONCILIATION_BUDGET_EXHAUSTED' END,reason=CASE WHEN park THEN 'RECONCILIATION_BUDGET_EXHAUSTED' ELSE 'RECONCILIATION_LEASE_EXPIRED' END WHERE effect_intents.operation_id=op;
  IF park THEN RETURN jsonb_build_object('parked',true,'operationId',op); END IF;
  RETURN NULL;
 END IF;
 IF i.reconcile_slots_used>=3 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Recovery budget exhausted'; END IF;
 IF i.ownership_epoch=9223372036854775807 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fence exhausted'; END IF;
 UPDATE zbm_simulation_runtime.effect_intents SET ownership_epoch=ownership_epoch+1,owner_kind='RECONCILE',owner_login=session_user::text,owner_token=claim_token,lease_until=dt+interval '10 seconds',status='UNKNOWN_PENDING_RECONCILIATION',next_dispatch_at=NULL,next_reconcile_at=NULL,reconcile_slots_used=reconcile_slots_used+1,total_reconcile_claims=total_reconcile_claims+1 WHERE effect_intents.operation_id=op RETURNING * INTO i;
 PERFORM zbm_simulation_runtime._event(i,'RECONCILE_CLAIMED');
 RETURN zbm_simulation_runtime._claim_json(i);
END $$;

CREATE FUNCTION zbm_simulation_runtime.reconcile_effect(t text,c text,operation_id uuid,epoch bigint,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i zbm_simulation_runtime.effect_intents;cmd zbm_simulation_runtime.commands;f zbm_simulation_runtime.fake_operations;r zbm_simulation_runtime.fake_receipts;st text;why text;rid uuid;park boolean:=false;due timestamptz;dt timestamptz;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c);i:=zbm_simulation_runtime._lock_intent(t,c,operation_id);
 IF i.status IN ('COMPLETED','FAILED') THEN
  IF NOT EXISTS(SELECT 1 FROM zbm_simulation_runtime.attempt_events a WHERE a.tenant_id=t AND a.campaign_id=c AND a.operation_id=i.operation_id AND a.ownership_epoch=epoch AND a.owner_token=token AND a.owner_login=session_user::text AND a.event_kind IN ('EFFECT_COMPLETED','EFFECT_FAILED')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Ownership unavailable'; END IF;
  RETURN zbm_simulation_runtime._effect_json(i);
 END IF;
 PERFORM zbm_simulation_runtime._owner(i,epoch,token,'RECONCILE');
 SELECT * INTO cmd FROM zbm_simulation_runtime.commands WHERE tenant_id=t AND campaign_id=c AND id=i.command_id;
 -- Immutable receipts need no row locks. Intent fence excludes all past/future dispatch writers.
 SELECT * INTO f FROM zbm_simulation_runtime.fake_operations x WHERE x.tenant_id=t AND x.campaign_id=c AND x.operation_id=i.operation_id;
 SELECT * INTO r FROM zbm_simulation_runtime.fake_receipts x WHERE x.tenant_id=t AND x.campaign_id=c AND x.operation_id=i.operation_id;
 dt:=clock_timestamp();
 IF f.operation_id IS NOT NULL AND r.id IS NOT NULL AND f.canonical=i.canonical AND f.identity_hash=i.identity_hash AND r.identity_hash=i.identity_hash AND f.receipt_id=r.id AND f.ownership_epoch=r.ownership_epoch AND r.payload_sha256=cmd.next_payload_sha256 AND EXISTS(SELECT 1 FROM zbm_simulation_runtime.effect_attempts a WHERE a.operation_id=i.operation_id AND a.ownership_epoch=f.ownership_epoch AND a.attempt_uuid=f.attempt_uuid AND a.dispatch_number<=i.dispatch_claims_used) THEN
  st:='COMPLETED';rid:=r.id;PERFORM zbm_simulation_runtime._event(i,'EFFECT_COMPLETED');
 ELSIF f.operation_id IS NULL AND r.id IS NULL THEN
  IF i.dispatch_claims_used>=3 THEN st:='FAILED';why:='DISPATCH_BUDGET_EXHAUSTED_NO_EFFECT';
  ELSIF NOT zbm_authority_evidence.assess_simulation_dispatch(t,c,cmd.requester_login,cmd.probe_id,cmd.request->>'expectedVersion',cmd.transition_hash,cmd.approval_ids) THEN st:='FAILED';why:='AUTHORITY_REVOKED_NO_EFFECT';
  ELSE st:='PENDING';why:='NO_EFFECT_RETRY';due:=dt+CASE WHEN i.dispatch_claims_used=1 THEN interval '1 second' ELSE interval '5 seconds' END;
  END IF;
  PERFORM zbm_simulation_runtime._event(i,CASE WHEN st='FAILED' THEN 'EFFECT_FAILED' ELSE 'RETRY_SCHEDULED' END,why);
 ELSE
  st:='UNKNOWN_PENDING_RECONCILIATION';why:='RECEIPT_IDENTITY_INCONSISTENT';park:=i.reconcile_slots_used>=3;
  PERFORM zbm_simulation_runtime._event(i,'RECONCILE_UNRESOLVED',why);
  UPDATE zbm_simulation_runtime.effect_intents SET unsuccessful_reconciliations=unsuccessful_reconciliations+1,total_unsuccessful_reconciliations=total_unsuccessful_reconciliations+1 WHERE effect_intents.operation_id=i.operation_id;
  IF park THEN why:='RECONCILIATION_BUDGET_EXHAUSTED';PERFORM zbm_simulation_runtime._event(i,'RECOVERY_PARKED',why);
  ELSE due:=dt+CASE WHEN i.reconcile_slots_used=1 THEN interval '1 second' ELSE interval '5 seconds' END; END IF;
 END IF;
 UPDATE zbm_simulation_runtime.effect_intents SET status=st,reason=why,receipt_id=rid,parked=park,park_reason=CASE WHEN park THEN why END,owner_kind='NONE',owner_login=NULL,owner_token=NULL,lease_until=NULL,next_dispatch_at=CASE WHEN st='PENDING' THEN due END,next_reconcile_at=CASE WHEN st='UNKNOWN_PENDING_RECONCILIATION' AND NOT park THEN due END WHERE effect_intents.operation_id=i.operation_id RETURNING * INTO i;
 RETURN zbm_simulation_runtime._effect_json(i);
END $$;

CREATE FUNCTION zbm_simulation_runtime.inspect_worker_claim(t text,c text,claim_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a zbm_simulation_runtime.attempt_events;i zbm_simulation_runtime.effect_intents;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c);
 IF claim_token IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Claim token required'; END IF;
 SELECT * INTO a FROM zbm_simulation_runtime.attempt_events WHERE tenant_id=t AND campaign_id=c AND owner_token=claim_token AND owner_login=session_user::text AND event_kind IN ('DISPATCH_CLAIMED','RECONCILE_CLAIMED');
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 i:=zbm_simulation_runtime._lock_intent(t,c,a.operation_id);
 RETURN jsonb_build_object('found',true,'operationId',i.operation_id,'epoch',a.ownership_epoch::text,'token',claim_token,'kind',CASE WHEN a.event_kind='DISPATCH_CLAIMED' THEN 'DISPATCH' ELSE 'RECONCILE' END,'current',coalesce(i.owner_token=claim_token AND i.owner_login=session_user::text AND i.ownership_epoch=a.ownership_epoch AND i.lease_until>clock_timestamp() AND NOT i.parked,false),'terminal',i.status IN ('COMPLETED','FAILED'));
END $$;
CREATE FUNCTION zbm_simulation_runtime.next_due(t text,c text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE due timestamptz;n integer;
BEGIN
 PERFORM zbm_simulation_runtime._worker(t,c);
 SELECT min(CASE WHEN NOT parked AND status NOT IN ('COMPLETED','FAILED') THEN CASE WHEN owner_kind<>'NONE' THEN lease_until ELSE least(next_dispatch_at,next_reconcile_at) END END),count(*) FILTER(WHERE parked)::integer INTO due,n FROM zbm_simulation_runtime.effect_intents WHERE tenant_id=t AND campaign_id=c;
 RETURN jsonb_build_object('nextDue',due,'parkedCount',n);
END $$;

-- Narrow post-operation identity check: B remains the authority owner.
-- The invoker cannot select a principal, purpose, capability, evidence or approval.
CREATE FUNCTION zbm_simulation_runtime.observe_runtime_principal(t text,c text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;
BEGIN
 IF NOT (pg_has_role(session_user,'zbm_sim_executor','MEMBER') OR pg_has_role(session_user,'zbm_sim_result_reader','MEMBER') OR pg_has_role(session_user,'zbm_sim_worker','MEMBER'))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 b:=zbm_authority_evidence.authorize_simulation_read(t,c);
 RETURN jsonb_build_object('principal',b->>'principal','login',b->>'login','tenant',t,'campaign',c);
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA zbm_simulation_runtime FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zbm_simulation_runtime FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zbm_simulation_runtime FROM PUBLIC;
GRANT USAGE ON SCHEMA zbm_simulation_runtime TO zbm_sim_executor,zbm_sim_result_reader,zbm_sim_worker;
GRANT EXECUTE ON FUNCTION zbm_simulation_runtime.submit_or_replay(jsonb,boolean),zbm_simulation_runtime.read_own_result(text,text,text) TO zbm_sim_executor,zbm_sim_result_reader;
GRANT EXECUTE ON FUNCTION zbm_simulation_runtime.claim_effect(text,text,uuid),zbm_simulation_runtime.dispatch_fake(text,text,uuid,bigint,uuid),zbm_simulation_runtime.request_reconciliation(text,text,uuid,bigint,uuid),zbm_simulation_runtime.claim_reconciliation(text,text,uuid),zbm_simulation_runtime.reconcile_effect(text,text,uuid,bigint,uuid),zbm_simulation_runtime.inspect_worker_claim(text,text,uuid),zbm_simulation_runtime.next_due(text,text) TO zbm_sim_worker;
GRANT EXECUTE ON FUNCTION zbm_simulation_runtime.observe_runtime_principal(text,text) TO zbm_sim_executor,zbm_sim_result_reader,zbm_sim_worker;
