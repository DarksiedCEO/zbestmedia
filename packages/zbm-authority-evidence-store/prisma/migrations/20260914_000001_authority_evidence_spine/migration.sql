DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zbm_ae_owner') THEN
  RAISE EXCEPTION 'Provision zbm_ae roles before ordinary migration';
 END IF;
END $$;
SET ROLE zbm_ae_owner;
CREATE SCHEMA IF NOT EXISTS zbm_authority_evidence AUTHORIZATION zbm_ae_owner;
REVOKE ALL ON SCHEMA zbm_authority_evidence FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA zbm_authority_evidence REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA zbm_authority_evidence REVOKE ALL ON SEQUENCES FROM PUBLIC;
CREATE TABLE zbm_authority_evidence.tenants (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 160),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zbm_authority_evidence.campaigns (
 tenant_id text NOT NULL REFERENCES zbm_authority_evidence.tenants(id),
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 160),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED')),
 environment text NOT NULL DEFAULT 'SIMULATION' CHECK(environment IN ('LOCAL','TEST','SIMULATION')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 PRIMARY KEY(tenant_id,id)
);
CREATE INDEX campaigns_status ON zbm_authority_evidence.campaigns(tenant_id,status);
CREATE TABLE zbm_authority_evidence.caller_bindings (
 login text PRIMARY KEY,
 principal text NOT NULL CHECK(length(principal) BETWEEN 1 AND 160),
 tenant_id text NOT NULL REFERENCES zbm_authority_evidence.tenants(id),
 campaign_id text,
 purpose text NOT NULL CHECK(purpose='SIMULATION'),
 capabilities text[] NOT NULL CHECK(capabilities <@ ARRAY['READ','AUDIT','MANAGE_TENANT','MANAGE_GRANT','RECORD_APPROVAL','APPEND_EVIDENCE']::text[]),
 issuers text[] NOT NULL CHECK(issuers <@ ARRAY['FOUNDER_CREATIVE','RIGHTS','EDITORIAL','TECHNICAL_QC','PUBLICATION','INDEPENDENT_APPEAL']::text[]),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 CHECK(array_position(capabilities,NULL) IS NULL AND array_position(issuers,NULL) IS NULL),
 UNIQUE(tenant_id,principal),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES zbm_authority_evidence.campaigns(tenant_id,id)
);
CREATE TABLE zbm_authority_evidence.grants (
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 160),
 tenant_id text NOT NULL REFERENCES zbm_authority_evidence.tenants(id),
 campaign_id text,
 scope_key text GENERATED ALWAYS AS (coalesce(campaign_id,'')) STORED,
 scope_kind text NOT NULL CHECK(scope_kind IN ('TENANT','CAMPAIGN')),
 principal text NOT NULL,
 purpose text NOT NULL CHECK(purpose='SIMULATION'),
 capability text NOT NULL CHECK(capability IN ('READ','AUDIT','MANAGE_TENANT','MANAGE_GRANT','RECORD_APPROVAL','APPEND_EVIDENCE')),
 valid_from timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','SUPERSEDED')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 changed_at timestamptz,
 successor_id text,
 PRIMARY KEY(tenant_id,scope_key,id),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES zbm_authority_evidence.campaigns(tenant_id,id),
 FOREIGN KEY(tenant_id,scope_key,successor_id) REFERENCES zbm_authority_evidence.grants(tenant_id,scope_key,id),
 CHECK ((scope_kind='TENANT')=(campaign_id IS NULL)),
 CHECK(expires_at>valid_from AND isfinite(valid_from) AND isfinite(expires_at)),
 CHECK(successor_id IS NULL OR successor_id<>id),
 CHECK((status='ACTIVE' AND changed_at IS NULL AND successor_id IS NULL) OR
 (status='REVOKED' AND changed_at IS NOT NULL AND successor_id IS NULL) OR
 (status='SUPERSEDED' AND changed_at IS NOT NULL AND successor_id IS NOT NULL))
);
CREATE INDEX grants_lookup ON zbm_authority_evidence.grants(tenant_id,principal,purpose,capability,scope_kind,campaign_id,status,expires_at);
CREATE TABLE zbm_authority_evidence.approvals (
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 160),
 tenant_id text NOT NULL,
 campaign_id text NOT NULL,
 subject_type text NOT NULL CHECK(length(subject_type) BETWEEN 1 AND 160),
 subject_id text NOT NULL CHECK(length(subject_id) BETWEEN 1 AND 160),
 subject_version text NOT NULL CHECK(length(subject_version) BETWEEN 1 AND 160),
 subject_hash text NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 issuer text NOT NULL CHECK(issuer IN ('FOUNDER_CREATIVE','RIGHTS','EDITORIAL','TECHNICAL_QC','PUBLICATION','INDEPENDENT_APPEAL')),
 actor text NOT NULL,
 custodial_login text NOT NULL REFERENCES zbm_authority_evidence.caller_bindings(login),
 valid_from timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','SUPERSEDED')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 changed_at timestamptz,
 successor_id text,
 PRIMARY KEY(tenant_id,campaign_id,id),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES zbm_authority_evidence.campaigns(tenant_id,id),
 FOREIGN KEY(tenant_id,campaign_id,successor_id) REFERENCES zbm_authority_evidence.approvals(tenant_id,campaign_id,id),
 CHECK(expires_at>valid_from AND isfinite(valid_from) AND isfinite(expires_at)),
 CHECK(successor_id IS NULL OR successor_id<>id),
 CHECK((status='ACTIVE' AND changed_at IS NULL AND successor_id IS NULL) OR
 (status='REVOKED' AND changed_at IS NOT NULL AND successor_id IS NULL) OR
 (status='SUPERSEDED' AND changed_at IS NOT NULL AND successor_id IS NOT NULL))
);
CREATE INDEX approvals_lookup ON zbm_authority_evidence.approvals(tenant_id,campaign_id,subject_id,subject_version,subject_hash,issuer,status,expires_at);
CREATE TABLE zbm_authority_evidence.evidence (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id text NOT NULL REFERENCES zbm_authority_evidence.tenants(id),
 campaign_id text,
 stream text NOT NULL CHECK(length(stream) BETWEEN 1 AND 160),
 sequence bigint NOT NULL CHECK(sequence>0),
 operation text NOT NULL CHECK(operation IN ('APPEND','SUPERSEDE')),
 predecessor text REFERENCES zbm_authority_evidence.evidence(id),
 canonical text NOT NULL,
 prior_hash text NOT NULL CHECK(prior_hash ~ '^[a-f0-9]{64}$'),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 custodial_login text NOT NULL REFERENCES zbm_authority_evidence.caller_bindings(login),
 actor text NOT NULL,
 appended_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES zbm_authority_evidence.campaigns(tenant_id,id),
 UNIQUE NULLS NOT DISTINCT (tenant_id,campaign_id,stream,sequence),
 UNIQUE(predecessor),
 CHECK ((operation='APPEND' AND predecessor IS NULL) OR (operation='SUPERSEDE' AND predecessor IS NOT NULL AND predecessor<>id)),
 CHECK(hash=encode(sha256(convert_to(canonical,'UTF8')),'hex'))
);
CREATE INDEX evidence_scope ON zbm_authority_evidence.evidence(tenant_id,campaign_id,stream,appended_at);
-- v1 key: SHA256(UTF8(jsonb array text [version, kind, identity...])), first 64 bits.
-- A single tenant lock precedes all scope/stream work. Hash collisions serialize.
CREATE FUNCTION zbm_authority_evidence.lock_key(parts jsonb) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT ('x'||substr(encode(sha256(convert_to(parts::text,'UTF8')),'hex'),1,16))::bit(64)::bigint
$$;
CREATE FUNCTION zbm_authority_evidence.binding_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' AND (NEW.login,NEW.principal,NEW.tenant_id,NEW.campaign_id,NEW.purpose) IS DISTINCT FROM
 (OLD.login,OLD.principal,OLD.tenant_id,OLD.campaign_id,OLD.purpose) THEN RAISE EXCEPTION 'Immutable binding identity'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',NEW.login)));
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',NEW.tenant_id)));
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER caller_binding_lock BEFORE INSERT OR UPDATE ON zbm_authority_evidence.caller_bindings FOR EACH ROW EXECUTE FUNCTION zbm_authority_evidence.binding_lock();
-- Owner-only binding changes prelock BEFORE UPDATE can take a tuple lock.
CREATE FUNCTION zbm_authority_evidence.change_binding(target_login text,enabled boolean) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t text;
BEGIN
 IF enabled IS NULL THEN RAISE EXCEPTION 'Active state required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',target_login)));
 SELECT tenant_id INTO t FROM zbm_authority_evidence.caller_bindings WHERE login=target_login FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Binding unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t)));
 UPDATE zbm_authority_evidence.caller_bindings SET active=enabled WHERE login=target_login;
END $$;
-- A single protected clock value is shared by grant and approval checks.
CREATE TYPE zbm_authority_evidence.authorized_scope AS (binding zbm_authority_evidence.caller_bindings, decision_time timestamptz);
-- Provisioning authority only: absent rows still participate in tenant serialization.
CREATE FUNCTION zbm_authority_evidence.provision_tenant(t text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t)));
 INSERT INTO zbm_authority_evidence.tenants(id) VALUES(t);
END $$;
CREATE FUNCTION zbm_authority_evidence.provision_campaign(t text,c text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t)));
 PERFORM 1 FROM zbm_authority_evidence.tenants WHERE id=t FOR UPDATE;
 INSERT INTO zbm_authority_evidence.campaigns(tenant_id,id) VALUES(t,c);
END $$;
CREATE FUNCTION zbm_authority_evidence.authorize_scope(t text,c text,p text,cap text,allow_inactive boolean DEFAULT false)
RETURNS zbm_authority_evidence.authorized_scope LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; tenant_status text; campaign_status text; dt timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='READ COMMITTED required'; END IF;
 IF t IS NULL OR p IS NULL OR cap IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',session_user::text)));
 SELECT * INTO b FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text FOR UPDATE;
 IF NOT FOUND OR NOT b.active OR b.tenant_id<>t OR b.purpose<>p OR NOT (cap=ANY(b.capabilities)) OR
 (b.campaign_id IS NOT NULL AND b.campaign_id IS DISTINCT FROM c) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t)));
 SELECT status INTO tenant_status FROM zbm_authority_evidence.tenants WHERE id=t FOR UPDATE;
 IF NOT FOUND OR (tenant_status<>'ACTIVE' AND allow_inactive IS NOT TRUE) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF c IS NOT NULL THEN
  SELECT status INTO campaign_status FROM zbm_authority_evidence.campaigns WHERE tenant_id=t AND id=c FOR UPDATE;
  IF NOT FOUND OR (campaign_status<>'ACTIVE' AND allow_inactive IS NOT TRUE) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 END IF;
 dt:=clock_timestamp();
 PERFORM 1 FROM zbm_authority_evidence.grants WHERE tenant_id=t AND principal=b.principal AND purpose=p AND capability=cap AND
 (scope_kind='TENANT' OR campaign_id=c) AND status='ACTIVE' AND valid_from<=dt AND dt<expires_at FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 RETURN (b,dt)::zbm_authority_evidence.authorized_scope;
END $$;
CREATE FUNCTION zbm_authority_evidence.append_internal(t text,c text,stream_id text,payload jsonb,pred text,b zbm_authority_evidence.caller_bindings)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; prior text; canon text; eid text:=gen_random_uuid()::text; dt timestamptz:=clock_timestamp();
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION 'Payload must be an object'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','stream',t,c,stream_id)));
 IF pred IS NOT NULL AND NOT EXISTS(SELECT 1 FROM zbm_authority_evidence.evidence WHERE id=pred AND tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND stream=stream_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 SELECT sequence,hash INTO seq,prior FROM zbm_authority_evidence.evidence WHERE tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND stream=stream_id ORDER BY sequence DESC LIMIT 1;
 seq:=coalesce(seq,0)+1;prior:=coalesce(prior,repeat('0',64));
 canon:=jsonb_build_array('zbm-ae-evidence-v1',eid,t,c,stream_id,seq,CASE WHEN pred IS NULL THEN 'APPEND' ELSE 'SUPERSEDE' END,pred,prior,b.principal,b.login,to_char(dt AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),payload)::text;
 INSERT INTO zbm_authority_evidence.evidence(id,tenant_id,campaign_id,stream,sequence,operation,predecessor,canonical,prior_hash,hash,custodial_login,actor,appended_at)
 VALUES(eid,t,c,stream_id,seq,CASE WHEN pred IS NULL THEN 'APPEND' ELSE 'SUPERSEDE' END,pred,canon,prior,encode(sha256(convert_to(canon,'UTF8')),'hex'),b.login,b.principal,dt);
 RETURN eid;
END $$;
CREATE FUNCTION zbm_authority_evidence.immutable_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Evidence is append-only'; END $$;
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON zbm_authority_evidence.evidence FOR EACH ROW EXECUTE FUNCTION zbm_authority_evidence.immutable_evidence();
CREATE FUNCTION zbm_authority_evidence.observe_authority(t text,c text,p text,cap text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings;
BEGIN b:=(zbm_authority_evidence.authorize_scope(t,c,p,cap,cap='AUDIT')).binding;
 RETURN jsonb_build_object('principal',b.principal,'tenant',t,'campaign',c,'purpose',p,'capability',cap,'bindingVersion',b.version);
END $$;
CREATE FUNCTION zbm_authority_evidence.append_evidence(t text,c text,p text,stream_id text,payload jsonb,pred text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings;
BEGIN b:=(zbm_authority_evidence.authorize_scope(t,c,p,'APPEND_EVIDENCE')).binding;
 RETURN zbm_authority_evidence.append_internal(t,c,stream_id,payload,pred,b);
END $$;
CREATE FUNCTION zbm_authority_evidence.read_evidence(t text,c text,p text,eid text,audit boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 audit:=coalesce(audit,false);
 PERFORM zbm_authority_evidence.authorize_scope(t,c,p,CASE WHEN audit THEN 'AUDIT' ELSE 'READ' END,audit);
 SELECT to_jsonb(e)||jsonb_build_object('sequence',e.sequence::text) INTO result FROM zbm_authority_evidence.evidence e WHERE id=eid AND tenant_id=t AND campaign_id IS NOT DISTINCT FROM c;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 RETURN result;
END $$;
GRANT USAGE ON SCHEMA zbm_authority_evidence TO zbm_ae_authority_writer,zbm_ae_approval_writer,zbm_ae_evidence_writer,zbm_ae_reader,zbm_ae_auditor;
REVOKE ALL ON ALL TABLES IN SCHEMA zbm_authority_evidence FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zbm_authority_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.observe_authority(text,text,text,text) TO zbm_ae_reader,zbm_ae_auditor,zbm_ae_authority_writer,zbm_ae_approval_writer,zbm_ae_evidence_writer;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.append_evidence(text,text,text,text,jsonb,text) TO zbm_ae_evidence_writer;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.read_evidence(text,text,text,text,boolean) TO zbm_ae_reader,zbm_ae_auditor;
CREATE FUNCTION zbm_authority_evidence.set_tenant_status(t text,p text,next_status text,expected integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; old_status text; ver integer;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,NULL,p,'MANAGE_TENANT',true)).binding;
 SELECT status,version INTO old_status,ver FROM zbm_authority_evidence.tenants WHERE id=t;
 IF expected IS DISTINCT FROM ver THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF next_status IS NULL OR next_status NOT IN ('ACTIVE','SUSPENDED','REVOKED') OR old_status='REVOKED' OR old_status=next_status THEN RAISE EXCEPTION 'Invalid status transition'; END IF;
 UPDATE zbm_authority_evidence.tenants SET status=next_status,version=ver+1,changed_at=clock_timestamp() WHERE id=t;
 PERFORM zbm_authority_evidence.append_internal(t,NULL,'authority',jsonb_build_object('event','TENANT_STATUS','from',old_status,'to',next_status,'version',ver+1),NULL,b);
 RETURN ver+1;
END $$;
CREATE FUNCTION zbm_authority_evidence.create_grant(t text,c text,p text,record jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,c,p,'MANAGE_GRANT')).binding;
 IF record IS NULL OR jsonb_typeof(record)<>'object' OR record-'id'-'principal'-'scopeKind'-'capability'-'validFrom'-'expiresAt'<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid grant fields'; END IF;
 INSERT INTO zbm_authority_evidence.grants(id,tenant_id,campaign_id,scope_kind,principal,purpose,capability,valid_from,expires_at)
 VALUES(record->>'id',t,c,record->>'scopeKind',record->>'principal',p,record->>'capability',(record->>'validFrom')::timestamptz,(record->>'expiresAt')::timestamptz);
 PERFORM zbm_authority_evidence.append_internal(t,c,'authority',jsonb_build_object('event','GRANT_CREATED','grant',record),NULL,b);
 RETURN record->>'id';
END $$;
CREATE FUNCTION zbm_authority_evidence.revoke_grant(t text,c text,p text,gid text,expected integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; g zbm_authority_evidence.grants;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,c,p,'MANAGE_GRANT')).binding;
 SELECT * INTO g FROM zbm_authority_evidence.grants WHERE tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND id=gid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF expected IS DISTINCT FROM g.version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF g.status<>'ACTIVE' THEN RAISE EXCEPTION 'Inactive grant'; END IF;
 UPDATE zbm_authority_evidence.grants SET status='REVOKED',version=version+1,changed_at=clock_timestamp() WHERE tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND id=gid;
 PERFORM zbm_authority_evidence.append_internal(t,c,'authority',jsonb_build_object('event','GRANT_REVOKED','grant',gid,'version',expected+1),NULL,b);
 RETURN expected+1;
END $$;
CREATE FUNCTION zbm_authority_evidence.supersede_grant(t text,c text,p text,gid text,expected integer,successor jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; g zbm_authority_evidence.grants;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,c,p,'MANAGE_GRANT')).binding;
 SELECT * INTO g FROM zbm_authority_evidence.grants WHERE tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND id=gid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF expected IS DISTINCT FROM g.version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF g.status<>'ACTIVE' OR successor->>'id'=gid OR successor->>'principal' IS DISTINCT FROM g.principal OR successor->>'scopeKind' IS DISTINCT FROM g.scope_kind OR successor->>'capability' IS DISTINCT FROM g.capability THEN RAISE EXCEPTION 'Invalid grant successor'; END IF;
 PERFORM zbm_authority_evidence.create_grant(t,c,p,successor);
 UPDATE zbm_authority_evidence.grants SET status='SUPERSEDED',version=version+1,changed_at=clock_timestamp(),successor_id=successor->>'id' WHERE tenant_id=t AND campaign_id IS NOT DISTINCT FROM c AND id=gid;
 PERFORM zbm_authority_evidence.append_internal(t,c,'authority',jsonb_build_object('event','GRANT_SUPERSEDED','grant',gid,'successor',successor->>'id'),NULL,b);
 RETURN successor->>'id';
END $$;
CREATE FUNCTION zbm_authority_evidence.record_approval(t text,c text,p text,record jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; dt timestamptz; auth zbm_authority_evidence.authorized_scope;
BEGIN
 auth:=zbm_authority_evidence.authorize_scope(t,c,p,'RECORD_APPROVAL');b:=auth.binding;dt:=auth.decision_time;
 IF record IS NULL OR jsonb_typeof(record)<>'object' OR record-'id'-'subjectType'-'subjectId'-'subjectVersion'-'subjectHash'-'issuer'-'actor'-'validFrom'-'expiresAt'<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid approval fields'; END IF;
 IF record->>'actor' IS DISTINCT FROM b.principal OR NOT coalesce(record->>'issuer'=ANY(b.issuers),false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF NOT coalesce((record->>'validFrom')::timestamptz<=dt AND dt<(record->>'expiresAt')::timestamptz,false) THEN RAISE EXCEPTION 'Approval not valid now'; END IF;
 INSERT INTO zbm_authority_evidence.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at)
 VALUES(record->>'id',t,c,record->>'subjectType',record->>'subjectId',record->>'subjectVersion',record->>'subjectHash',record->>'issuer',b.principal,b.login,(record->>'validFrom')::timestamptz,(record->>'expiresAt')::timestamptz);
 PERFORM zbm_authority_evidence.append_internal(t,c,'approvals',jsonb_build_object('event','APPROVAL_RECORDED','approval',record),NULL,b);
 RETURN record->>'id';
END $$;
CREATE FUNCTION zbm_authority_evidence.revoke_approval(t text,c text,p text,aid text,expected integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; a zbm_authority_evidence.approvals;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,c,p,'RECORD_APPROVAL')).binding;
 SELECT * INTO a FROM zbm_authority_evidence.approvals WHERE tenant_id=t AND campaign_id=c AND id=aid FOR UPDATE;
 IF NOT FOUND OR NOT a.issuer=ANY(b.issuers) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF expected IS DISTINCT FROM a.version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF a.status<>'ACTIVE' THEN RAISE EXCEPTION 'Inactive approval'; END IF;
 UPDATE zbm_authority_evidence.approvals SET status='REVOKED',changed_at=clock_timestamp(),version=version+1 WHERE tenant_id=t AND campaign_id=c AND id=aid;
 PERFORM zbm_authority_evidence.append_internal(t,c,'approvals',jsonb_build_object('event','APPROVAL_REVOKED','approval',aid),NULL,b);
 RETURN expected+1;
END $$;
CREATE FUNCTION zbm_authority_evidence.supersede_approval(t text,c text,p text,aid text,expected integer,successor jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; a zbm_authority_evidence.approvals;
BEGIN
 b:=(zbm_authority_evidence.authorize_scope(t,c,p,'RECORD_APPROVAL')).binding;
 SELECT * INTO a FROM zbm_authority_evidence.approvals WHERE tenant_id=t AND campaign_id=c AND id=aid FOR UPDATE;
 IF NOT FOUND OR NOT a.issuer=ANY(b.issuers) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 IF expected IS DISTINCT FROM a.version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF a.status<>'ACTIVE' OR successor->>'id'=aid OR successor->>'issuer' IS DISTINCT FROM a.issuer OR successor->>'subjectId' IS DISTINCT FROM a.subject_id OR successor->>'subjectType' IS DISTINCT FROM a.subject_type THEN RAISE EXCEPTION 'Invalid approval successor'; END IF;
 PERFORM zbm_authority_evidence.record_approval(t,c,p,successor);
 UPDATE zbm_authority_evidence.approvals SET status='SUPERSEDED',changed_at=clock_timestamp(),version=version+1,successor_id=successor->>'id' WHERE tenant_id=t AND campaign_id=c AND id=aid;
 PERFORM zbm_authority_evidence.append_internal(t,c,'approvals',jsonb_build_object('event','APPROVAL_SUPERSEDED','approval',aid,'successor',successor->>'id'),NULL,b);
 RETURN successor->>'id';
END $$;
CREATE FUNCTION zbm_authority_evidence.read_approval(t text,c text,p text,aid text,stype text,sid text,sver text,shash text,authority text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a zbm_authority_evidence.approvals; dt timestamptz; auth zbm_authority_evidence.authorized_scope;
BEGIN
 auth:=zbm_authority_evidence.authorize_scope(t,c,p,'READ');dt:=auth.decision_time;
 SELECT * INTO a FROM zbm_authority_evidence.approvals WHERE tenant_id=t AND campaign_id=c AND id=aid AND subject_type=stype AND subject_id=sid AND subject_version=sver AND subject_hash=shash AND issuer=authority AND status='ACTIVE' AND valid_from<=dt AND dt<expires_at FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zbm_authority_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.set_tenant_status(text,text,text,integer),zbm_authority_evidence.create_grant(text,text,text,jsonb),zbm_authority_evidence.revoke_grant(text,text,text,text,integer),zbm_authority_evidence.supersede_grant(text,text,text,text,integer,jsonb) TO zbm_ae_authority_writer;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.record_approval(text,text,text,jsonb),zbm_authority_evidence.revoke_approval(text,text,text,text,integer),zbm_authority_evidence.supersede_approval(text,text,text,text,integer,jsonb) TO zbm_ae_approval_writer;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.read_approval(text,text,text,text,text,text,text,text,text) TO zbm_ae_reader,zbm_ae_approval_writer;
