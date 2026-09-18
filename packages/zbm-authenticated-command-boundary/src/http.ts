import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { authorizeTenant, type ServiceIdentity } from '@zbest/service-auth';
import type { Snapshot } from './config';
import type { createDatabase } from './database';
import { authenticate } from './authentication';
import { BoundaryError, inspectionSchema, type InspectionRequest, type InspectionResponse } from './requests';
import { safeLog, type OperationalEvent } from './logging';

type RequestState={requestId:string;started:number;identity?:ServiceIdentity;operation?:InspectionRequest['kind'];decision?:OperationalEvent['decision'];sqlstateCategory?:OperationalEvent['sqlstateCategory']};
const errorNames={400:'BAD_REQUEST',401:'UNAUTHENTICATED',403:'FORBIDDEN',500:'INTERNAL_ERROR',503:'UNAVAILABLE'} as const;
export function createPlugin(snapshot:Snapshot,database:ReturnType<typeof createDatabase>):FastifyPluginAsync {
  return async app=>{
    const states=new WeakMap<FastifyRequest,RequestState>();
    app.addHook('onClose',async()=>{await database.close();});
    // Within this encapsulated plugin, parser failures and auth failures share the same safe error handler.
    app.setErrorHandler((error,request,reply)=>{
      const state=states.get(request);
      let status:400|401|403|500|503=500;
      if(error instanceof BoundaryError) status=error.statusCode;
      else if(error.statusCode && [400,413,415].includes(error.statusCode)) status=400;
      if(state) {
        state.decision=status===400?'invalid':status===401?'unauthenticated':status===403?'denied':status===503?'unavailable':'error';
        if(error instanceof BoundaryError) state.sqlstateCategory=error.sqlstateCategory;
      }
      reply.header('Cache-Control','no-store').code(status).send({error:errorNames[status],requestId:state?.requestId ?? randomUUID()});
    });
    app.post('/internal/simulation/authority-inspections',{
      bodyLimit:16*1024,
      // Suppress the route's inherited request logging; safeLog is the only boundary operational sink.
      logLevel:'silent',
      onRequest:async(request,reply)=>{
        const state:RequestState={requestId:randomUUID(),started:performance.now()}; states.set(request,state);
        reply.header('Cache-Control','no-store');
        state.identity=authenticate(request.headers.authorization,request.raw.rawHeaders,snapshot.authConfig,snapshot.policies,snapshot.now());
        const contentType=request.headers['content-type'];
        if(typeof contentType!=='string' || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)) throw new BoundaryError(400);
      },
      onSend:async(_request,reply,payload)=>{reply.header('Cache-Control','no-store');return payload;},
      onResponse:async(request)=>{
        const state=states.get(request);
        if(!state) return;
        safeLog(snapshot.log,{requestId:state.requestId,operation:state.operation,keyId:state.identity?.keyId,
          decision:state.decision ?? 'error',latencyMs:Math.max(0,performance.now()-state.started),sqlstateCategory:state.sqlstateCategory});
      }
    },async(request):Promise<InspectionResponse>=>{
      const state=states.get(request);
      if(!state?.identity) throw new BoundaryError(401);
      const parsed=inspectionSchema.safeParse(request.body);
      if(!parsed.success) throw new BoundaryError(400);
      const inspection=parsed.data; state.operation=inspection.kind;
      try { authorizeTenant(state.identity,inspection.scope.tenantId); } catch { throw new BoundaryError(403); }
      const binding=snapshot.bindings.find(b=>b.keyId===state.identity!.keyId && b.tenantId===inspection.scope.tenantId);
      if(!binding) throw new BoundaryError(403);
      await database.inspect(binding,inspection);
      state.decision='observed';
      return {status:'OBSERVED_ONLY',execution:'DISABLED',kind:inspection.kind,requestId:state.requestId};
    });
  };
}
