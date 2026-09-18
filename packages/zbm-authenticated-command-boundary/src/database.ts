import pg from 'pg';
import type { PoolClient } from 'pg';
import type { ConnectionBinding, Snapshot } from './config';
import { BoundaryError, type InspectionRequest } from './requests';
import { verifyApproval, verifyObservation } from './inspect-authority';

function errorCode(error:unknown):string|undefined {
  if(typeof error==='object' && error!==null && 'code' in error && typeof error.code==='string') return error.code;
  return undefined;
}
function connectionFailure(error:unknown):boolean {
  const code=errorCode(error);
  return code?.startsWith('08')===true || ['57P01','57P02','57P03','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code ?? '');
}
function classify(error:unknown):BoundaryError {
  if(error instanceof BoundaryError) return error;
  const code=errorCode(error);
  if(code==='42501') return new BoundaryError(403,'authorization');
  if(connectionFailure(error)) return new BoundaryError(503,'connection',true);
  if(['55P03','40P01','57014','40001','53300','53400'].includes(code ?? '')) return new BoundaryError(503,'contention');
  return new BoundaryError(500,'internal');
}

export function createDatabase(snapshot:Snapshot) {
  const pools=new Map<string,pg.Pool>();
  for(const [slot,connection] of snapshot.connections) {
    // Empty options would fall back to PGOPTIONS in pg 8.13.1; use a fixed nonempty value.
    const poolOptions:pg.PoolConfig & {client_encoding:string}={...connection,ssl:false,options:'-c search_path=pg_catalog',
      application_name:'zbm-authority-inspection',client_encoding:'UTF8',max:2,connectionTimeoutMillis:2000,
      statement_timeout:5000,idle_in_transaction_session_timeout:5000};
    const pool=new pg.Pool(poolOptions);
    // pg removes idle broken clients itself. Always consume error events; never serialize SQL/credentials.
    pool.on('error',()=>{});
    pools.set(slot,pool);
  }
  let closed=false;
  let closing:Promise<void>|undefined;
  const close=():Promise<void> => {
    if(closing) return closing;
    closed=true;
    closing=Promise.allSettled([...pools.values()].map(pool=>pool.end())).then(results=>{
      if(results.some(result=>result.status==='rejected')) throw new BoundaryError(503,'connection');
    });
    return closing;
  };
  const inspect=async(binding:ConnectionBinding,request:InspectionRequest):Promise<void> => {
    if(closed) throw new BoundaryError(503,'connection');
    const pool=pools.get(binding.credentialSlot);
    if(!pool) throw new BoundaryError(500,'internal');
    let client:PoolClient;
    try { client=await pool.connect(); } catch { throw new BoundaryError(503,'connection'); }
    let transaction=false, commitAttempted=false, destroy=false, disconnected=false;
    const onError=()=>{disconnected=true;};
    client.on('error',onError);
    const assertConnected=()=>{if(disconnected) throw new BoundaryError(503,'connection',true);};
    try {
      if(closed) throw new BoundaryError(503,'connection');
      const session=await client.query('SELECT session_user::text AS session_user');
      if(session.rows.length!==1 || session.rows[0].session_user!==binding.databaseLogin) throw new BoundaryError(500,'internal',true);
      assertConnected();
      // Mark before BEGIN: a failed roundtrip may still have started a server transaction.
      transaction=true;
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
      const observed=await client.query('SELECT zbm_authority_evidence.observe_authority($1,$2,$3,$4) AS observation',
        [request.scope.tenantId,request.scope.campaignId,'SIMULATION','READ']);
      if(observed.rows.length!==1) throw new BoundaryError(500,'internal',true);
      verifyObservation(observed.rows[0].observation,binding,request);
      if(request.kind==='APPROVAL_READ') {
        const a=request.approval;
        const result=await client.query('SELECT zbm_authority_evidence.read_approval($1,$2,$3,$4,$5,$6,$7,$8,$9) AS approval',
          [request.scope.tenantId,request.scope.campaignId,'SIMULATION',a.id,a.subjectType,a.subjectId,a.subjectVersion,a.subjectSha256,a.issuer]);
        if(result.rows.length!==1) throw new BoundaryError(500,'internal',true);
        verifyApproval(result.rows[0].approval,request);
      }
      assertConnected();
      commitAttempted=true;
      await client.query('COMMIT');
      assertConnected();
      transaction=false;
    } catch(error) {
      let failure=classify(error);
      destroy=failure.destroy || disconnected || connectionFailure(error) || commitAttempted;
      if(commitAttempted || disconnected) failure=new BoundaryError(503,'connection',true);
      if(transaction) {
        try { await client.query('ROLLBACK'); }
        catch { destroy=true; failure=new BoundaryError(503,'connection',true); }
      } else if(!(error instanceof BoundaryError)) {
        // Session check itself failed: no trustworthy healthy checkout remains.
        destroy=true; failure=new BoundaryError(503,'connection',true);
      }
      throw failure;
    } finally {
      client.removeListener('error',onError);
      client.release(destroy || disconnected);
    }
  };
  return {inspect,close};
}
