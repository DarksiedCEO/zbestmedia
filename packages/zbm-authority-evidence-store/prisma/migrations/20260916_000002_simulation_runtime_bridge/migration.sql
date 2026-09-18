-- Forward-only B owner bridge. Privileged role provisioning precedes migration.
SET ROLE zbm_ae_owner;
ALTER TABLE zbm_authority_evidence.caller_bindings DROP CONSTRAINT caller_bindings_capabilities_check;
ALTER TABLE zbm_authority_evidence.caller_bindings ADD CONSTRAINT caller_bindings_capabilities_check CHECK
 (capabilities <@ ARRAY['READ','AUDIT','MANAGE_TENANT','MANAGE_GRANT','RECORD_APPROVAL','APPEND_EVIDENCE','EXECUTE_SIMULATION','PROCESS_SIMULATION']::text[]);
ALTER TABLE zbm_authority_evidence.grants DROP CONSTRAINT grants_capability_check;
ALTER TABLE zbm_authority_evidence.grants ADD CONSTRAINT grants_capability_check CHECK
 (capability IN ('READ','AUDIT','MANAGE_TENANT','MANAGE_GRANT','RECORD_APPROVAL','APPEND_EVIDENCE','EXECUTE_SIMULATION','PROCESS_SIMULATION'));

-- Private helpers are never granted to the bridge or runtime roles.
CREATE FUNCTION zbm_authority_evidence.simulation_lock_held(k bigint) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
 AND granted AND mode='ExclusiveLock' AND objsubid=1
 AND classid=((k >> 32) & 4294967295)::oid AND objid=(k & 4294967295)::oid)
$$;
CREATE FUNCTION zbm_authority_evidence.simulation_authority(l text,t text,c text,caps text[],dt timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM zbm_authority_evidence.caller_bindings b
 JOIN zbm_authority_evidence.tenants tn ON tn.id=b.tenant_id
 JOIN zbm_authority_evidence.campaigns cp ON cp.tenant_id=tn.id AND cp.id=c
 WHERE b.login=l AND b.active AND b.tenant_id=t AND b.purpose='SIMULATION'
 AND (b.campaign_id IS NULL OR b.campaign_id=c) AND caps <@ b.capabilities
 AND tn.status='ACTIVE' AND cp.status='ACTIVE' AND cp.environment='SIMULATION'
 AND NOT EXISTS(SELECT 1 FROM unnest(caps) cap WHERE NOT EXISTS(
 SELECT 1 FROM zbm_authority_evidence.grants g WHERE g.tenant_id=t AND g.principal=b.principal
 AND g.purpose='SIMULATION' AND g.capability=cap AND (g.scope_kind='TENANT' OR g.campaign_id=c)
 AND g.status='ACTIVE' AND g.valid_from<=dt AND dt<g.expires_at)))
$$;
CREATE FUNCTION zbm_authority_evidence.simulation_approval_valid(t text,c text,r text,sid text,sv text,sh text,ids text[],dt timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT coalesce(cardinality(ids)=1 AND array_ndims(ids)=1 AND array_position(ids,NULL) IS NULL
 AND sid ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' AND sv ~ '^(0|[1-9][0-9]{0,18})$'
 AND (length(sv)<19 OR sv COLLATE "C" <= '9223372036854775807' COLLATE "C") AND sh ~ '^[a-f0-9]{64}$'
 AND EXISTS(SELECT 1 FROM zbm_authority_evidence.approvals a
 JOIN zbm_authority_evidence.caller_bindings b ON b.login=a.custodial_login
 JOIN zbm_authority_evidence.caller_bindings requester ON requester.login=r
 WHERE a.tenant_id=t AND a.campaign_id=c AND a.id=ids[array_lower(ids,1)]
 AND a.subject_type='SIMULATION_PROBE_TRANSITION_V1' AND a.subject_id=sid AND a.subject_version=sv AND a.subject_hash=sh
 AND a.issuer='TECHNICAL_QC' AND a.status='ACTIVE' AND a.valid_from<=dt AND dt<a.expires_at
 AND a.actor=b.principal AND a.actor<>requester.principal AND b.active AND b.tenant_id=t
 AND b.purpose='SIMULATION' AND (b.campaign_id IS NULL OR b.campaign_id=c)
 AND 'TECHNICAL_QC'=ANY(b.issuers)),false)
$$;

CREATE FUNCTION zbm_authority_evidence.lock_simulation_scope(t text,c text,operation text,requester_login text DEFAULT NULL,approval_ids text[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE names text[]; l text; k bigint; tenant_key bigint; caller zbm_authority_evidence.caller_bindings; requester zbm_authority_evidence.caller_bindings;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR operation IS NULL OR operation NOT IN ('READ','PROCESS','COMMAND','DISPATCH')
 OR t IS NULL OR c IS NULL OR t !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' OR c !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 names:=ARRAY[session_user::text];
 IF operation IN ('COMMAND','DISPATCH') THEN
  names:=names||ARRAY[requester_login]||ARRAY(SELECT a.custodial_login FROM zbm_authority_evidence.approvals a WHERE a.tenant_id=t AND a.campaign_id=c AND a.id=ANY(approval_ids));
 END IF;
 tenant_key:=zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t));
 -- A repeated call may use already prepared identities, never extend them after tenant locking.
 FOR l IN SELECT DISTINCT n COLLATE "C" FROM unnest(names) n WHERE n IS NOT NULL ORDER BY 1 LOOP
  k:=zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',l));
  IF zbm_authority_evidence.simulation_lock_held(tenant_key) AND NOT zbm_authority_evidence.simulation_lock_held(k)
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unprepared simulation identity'; END IF;
  PERFORM pg_advisory_xact_lock(k);
  PERFORM 1 FROM zbm_authority_evidence.caller_bindings WHERE login=l FOR UPDATE;
 END LOOP;
 PERFORM pg_advisory_xact_lock(tenant_key);
 PERFORM 1 FROM zbm_authority_evidence.tenants WHERE id=t FOR UPDATE;
 PERFORM 1 FROM zbm_authority_evidence.campaigns WHERE tenant_id=t AND id=c FOR UPDATE;
 -- Grant locks precede the final clock sample, including expired/not-yet-valid rows.
 PERFORM 1 FROM zbm_authority_evidence.grants g WHERE g.tenant_id=t AND (g.scope_kind='TENANT' OR g.campaign_id=c)
 AND g.principal IN (SELECT b.principal FROM zbm_authority_evidence.caller_bindings b WHERE b.login=session_user::text)
 ORDER BY g.scope_key COLLATE "C",g.id COLLATE "C" FOR UPDATE;
 SELECT * INTO caller FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text;
 IF operation IN ('COMMAND','DISPATCH') THEN SELECT * INTO requester FROM zbm_authority_evidence.caller_bindings WHERE login=requester_login; END IF;
 RETURN jsonb_build_object('caller',to_jsonb(caller),'requester',to_jsonb(requester),'locked',true,'authorized',false);
END $$;

CREATE FUNCTION zbm_authority_evidence.authorize_simulation_read(t text,c text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE dt timestamptz; b zbm_authority_evidence.caller_bindings;
BEGIN
 PERFORM zbm_authority_evidence.lock_simulation_scope(t,c,'READ'); dt:=clock_timestamp();
 IF NOT zbm_authority_evidence.simulation_authority(session_user::text,t,c,ARRAY['READ'],dt)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 SELECT * INTO b FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text;
 RETURN jsonb_build_object('principal',b.principal,'login',b.login,'decisionTime',dt);
END $$;
CREATE FUNCTION zbm_authority_evidence.authorize_simulation_process(t text,c text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE dt timestamptz; b zbm_authority_evidence.caller_bindings;
BEGIN
 PERFORM zbm_authority_evidence.lock_simulation_scope(t,c,'PROCESS'); dt:=clock_timestamp();
 IF NOT zbm_authority_evidence.simulation_authority(session_user::text,t,c,ARRAY['READ','PROCESS_SIMULATION'],dt)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 SELECT * INTO b FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text;
 RETURN jsonb_build_object('principal',b.principal,'login',b.login,'decisionTime',dt);
END $$;
CREATE FUNCTION zbm_authority_evidence.authorize_simulation_transition(t text,c text,operation text,requester_login text,subject_id text,subject_version text,subject_hash text,approval_ids text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE dt timestamptz; b zbm_authority_evidence.caller_bindings; a zbm_authority_evidence.approvals;
BEGIN
 IF operation IS NULL OR operation NOT IN ('COMMAND','DISPATCH') OR requester_login IS NULL
 OR (operation='COMMAND' AND requester_login<>session_user::text)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 PERFORM zbm_authority_evidence.lock_simulation_scope(t,c,operation,requester_login,approval_ids);
 PERFORM 1 FROM zbm_authority_evidence.grants g WHERE g.tenant_id=t AND (g.scope_kind='TENANT' OR g.campaign_id=c)
 AND g.principal IN (SELECT principal FROM zbm_authority_evidence.caller_bindings WHERE login=requester_login)
 ORDER BY g.scope_key COLLATE "C",g.id COLLATE "C" FOR UPDATE;
 FOR a IN SELECT * FROM zbm_authority_evidence.approvals WHERE tenant_id=t AND campaign_id=c AND id=ANY(approval_ids) ORDER BY id COLLATE "C" FOR UPDATE LOOP
  IF NOT zbm_authority_evidence.simulation_lock_held(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',a.custodial_login)))
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unprepared simulation identity'; END IF;
 END LOOP;
 -- Exactly one shared decision instant AFTER every potentially blocking authority lock.
 dt:=clock_timestamp();
 IF NOT zbm_authority_evidence.simulation_authority(requester_login,t,c,ARRAY['READ','EXECUTE_SIMULATION'],dt)
 OR (operation='DISPATCH' AND NOT zbm_authority_evidence.simulation_authority(session_user::text,t,c,ARRAY['READ','PROCESS_SIMULATION'],dt))
 OR NOT zbm_authority_evidence.simulation_approval_valid(t,c,requester_login,subject_id,subject_version,subject_hash,approval_ids,dt)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 SELECT * INTO b FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text;
 RETURN jsonb_build_object('principal',b.principal,'login',b.login,'decisionTime',dt);
END $$;

CREATE FUNCTION zbm_authority_evidence.assess_simulation_dispatch(t text,c text,requester_login text,subject_id text,subject_version text,subject_hash text,approval_ids text[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE dt timestamptz;
BEGIN
 PERFORM zbm_authority_evidence.authorize_simulation_process(t,c);
 dt:=clock_timestamp();
 -- Diagnostic only: no requester/custodian/approval locks after PROCESS's tenant lock.
 RETURN zbm_authority_evidence.simulation_authority(requester_login,t,c,ARRAY['READ','EXECUTE_SIMULATION'],dt)
 AND zbm_authority_evidence.simulation_approval_valid(t,c,requester_login,subject_id,subject_version,subject_hash,approval_ids,dt);
END $$;
CREATE FUNCTION zbm_authority_evidence.append_simulation_evidence(t text,c text,operation text,event jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b zbm_authority_evidence.caller_bindings; caps text[];
BEGIN
 IF operation IS NULL OR operation NOT IN ('COMMAND','PROCESS') OR event IS NULL OR jsonb_typeof(event)<>'object'
 OR event-'event'-'commandId'-'operationId'-'reason'-'ownershipEpoch'-'dispatchNumber'-'requesterPrincipal'-'identityHash'<>'{}'::jsonb
 OR jsonb_typeof(event->'event') IS DISTINCT FROM 'string' OR jsonb_typeof(event->'commandId') IS DISTINCT FROM 'string'
 OR length(event->>'commandId') NOT BETWEEN 1 AND 160
 OR (operation='COMMAND' AND event->>'event'<>'COMMAND_ACCEPTED')
 OR (operation='PROCESS' AND event->>'event' NOT IN ('DISPATCH_CLAIMED','RECONCILE_CLAIMED','RECONCILE_EXPIRED','RECONCILE_UNRESOLVED','RETRY_SCHEDULED','EFFECT_COMPLETED','EFFECT_FAILED','RECOVERY_PARKED'))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invalid simulation evidence'; END IF;
 -- Only trusted D owner code can reach this bridge. D guards acceptance/ownership/terminal uniqueness.
 -- Do not acquire binding locks here after D has locked its command/intent rows.
 IF NOT zbm_authority_evidence.simulation_lock_held(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','binding',session_user::text)))
 OR NOT zbm_authority_evidence.simulation_lock_held(zbm_authority_evidence.lock_key(jsonb_build_array('zbm-ae-v1','tenant',t)))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unprepared simulation evidence'; END IF;
 caps:=CASE WHEN operation='COMMAND' THEN ARRAY['READ','EXECUTE_SIMULATION'] ELSE ARRAY['READ','PROCESS_SIMULATION'] END;
 IF NOT zbm_authority_evidence.simulation_authority(session_user::text,t,c,caps,clock_timestamp())
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scope unavailable'; END IF;
 SELECT * INTO b FROM zbm_authority_evidence.caller_bindings WHERE login=session_user::text;
 RETURN zbm_authority_evidence.append_internal(t,c,'simulation-runtime-v1',event,NULL,b);
END $$;
REVOKE ALL ON FUNCTION zbm_authority_evidence.simulation_lock_held(bigint),zbm_authority_evidence.simulation_authority(text,text,text,text[],timestamptz),zbm_authority_evidence.simulation_approval_valid(text,text,text,text,text,text,text[],timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION zbm_authority_evidence.lock_simulation_scope(text,text,text,text,text[]),zbm_authority_evidence.authorize_simulation_transition(text,text,text,text,text,text,text,text[]),zbm_authority_evidence.authorize_simulation_read(text,text),zbm_authority_evidence.authorize_simulation_process(text,text),zbm_authority_evidence.assess_simulation_dispatch(text,text,text,text,text,text,text[]),zbm_authority_evidence.append_simulation_evidence(text,text,text,jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA zbm_authority_evidence TO zbm_ae_simulation_bridge;
GRANT EXECUTE ON FUNCTION zbm_authority_evidence.lock_simulation_scope(text,text,text,text,text[]),zbm_authority_evidence.authorize_simulation_transition(text,text,text,text,text,text,text,text[]),zbm_authority_evidence.authorize_simulation_read(text,text),zbm_authority_evidence.authorize_simulation_process(text,text),zbm_authority_evidence.assess_simulation_dispatch(text,text,text,text,text,text,text[]),zbm_authority_evidence.append_simulation_evidence(text,text,text,jsonb) TO zbm_ae_simulation_bridge;

-- Narrow cross-owner REFERENCES only; no SELECT/DML or ownership passes to D.
ALTER TABLE zbm_authority_evidence.evidence ADD CONSTRAINT evidence_scoped_identity UNIQUE(tenant_id,campaign_id,id);
GRANT REFERENCES(tenant_id,id) ON zbm_authority_evidence.campaigns TO zbm_ae_simulation_bridge;
GRANT REFERENCES(tenant_id,campaign_id,id) ON zbm_authority_evidence.evidence TO zbm_ae_simulation_bridge;
