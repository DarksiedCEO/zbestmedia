import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { BoundaryDependencies, ServiceAuthenticator, ServiceAuthenticationContext } from '@zbest/zbm-authenticated-command-boundary';
import { commandSchema, resultRequestSchema, parseRequest, RuntimeError } from './contracts';
import type { Connections } from './connections';
import { submitCommand } from './commands';
import { readResult } from './results';

type State = { requestId: string; started: number; context?: ServiceAuthenticationContext; category: string };
export function safeLog(log: BoundaryDependencies['log'], category: string, requestId: string, started: number): void {
  try {
    // Copy only these three fields. A failing or asynchronous sink cannot change transaction/HTTP truth.
    const result = log?.(Object.freeze({ category, requestId, durationMs: Math.max(0, performance.now() - started) }));
    void Promise.resolve(result).catch(() => {});
  } catch { /* Operational logging must not alter a committed outcome. */ }
}
const errors = {400:'BAD_REQUEST',401:'UNAUTHENTICATED',403:'FORBIDDEN',409:'CONFLICT',500:'INTERNAL_ERROR',503:'UNAVAILABLE'} as const;
export function createPlugin(authenticator: ServiceAuthenticator, database: Connections,
  log: BoundaryDependencies['log'], close: () => Promise<void>): FastifyPluginAsync {
  return async app => {
    const states = new WeakMap<FastifyRequest, State>();
    app.addHook('onClose', close);
    app.setErrorHandler((error, request, reply) => {
      const state = states.get(request);
      let status: keyof typeof errors = 500;
      if (error instanceof RuntimeError) status = error.statusCode;
      // C's opaque authenticator throws its existing BoundaryError; never import private C modules.
      else if (error.message === 'Boundary request failed' && (error.statusCode === 401 || error.statusCode === 403)) status = error.statusCode;
      else if ([400,413,415].includes(error.statusCode ?? 0)) status = 400;
      if (state) state.category = status === 500 ? 'internal' : errors[status].toLowerCase();
      const uncertain = error instanceof RuntimeError && error.uncertain;
      reply.header('Cache-Control', 'no-store').code(status).send({
        error: errors[status], requestId: state?.requestId ?? randomUUID(),
        ...(uncertain ? { acceptance: 'UNKNOWN' as const } : {})
      });
    });
    for (const mode of ['command', 'result'] as const) {
      app.post(mode === 'command' ? '/internal/simulation/probe-commands' : '/internal/simulation/probe-command-results', {
        bodyLimit: 16 * 1024, logLevel: 'silent',
        onRequest: async (request, reply) => {
          const state: State = { requestId: randomUUID(), started: performance.now(), category: 'internal' };
          states.set(request, state);
          reply.header('Cache-Control', 'no-store');
          state.context = authenticator.authenticateHeaders(request.headers.authorization, request.raw.rawHeaders);
          const contentType = request.headers['content-type'];
          if (typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)) throw new RuntimeError(400, 'invalid');
        },
        onSend: async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); return payload; },
        onResponse: async request => {
          const state = states.get(request);
          if (state) safeLog(log, state.category, state.requestId, state.started);
        }
      }, async (request, reply) => {
        const state = states.get(request);
        if (!state?.context) throw new RuntimeError(401, 'unauthenticated');
        if (mode === 'command') {
          const command = parseRequest(commandSchema, request.body);
          const binding = authenticator.resolveTenant(state.context, command.scope.tenantId);
          const result = await submitCommand(database, binding, command);
          state.category = result.replay ? 'replay' : 'accepted';
          reply.code(command.completion === 'STATE_ONLY' ? 200 : 202);
          return result;
        }
        const query = parseRequest(resultRequestSchema, request.body);
        const binding = authenticator.resolveTenant(state.context, query.scope.tenantId);
        const result = await readResult(database, binding, query);
        state.category = 'result';
        return result;
      });
    }
  };
}
