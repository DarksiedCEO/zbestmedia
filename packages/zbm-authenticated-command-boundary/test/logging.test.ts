import { expect, it, vi } from 'vitest';
import { safeLog } from '../src/logging';
it('allowlists operational fields and freezes emitted records', () => {
  const log=vi.fn(); safeLog(log, {requestId:'req-1',operation:'SCOPE_READ',keyId:'verified-service',decision:'denied',latencyMs:3,sqlstateCategory:'authorization',token:'secret-sentinel',headers:{authorization:'secret-sentinel'},body:'secret-sentinel',error:new Error('secret-sentinel')} as any);
  expect(log).toHaveBeenCalledOnce(); const event=log.mock.calls[0][0];
  expect(event).toEqual({requestId:'req-1',operation:'SCOPE_READ',keyId:'verified-service',decision:'denied',latencyMs:3,sqlstateCategory:'authorization'});
  expect(Object.isFrozen(event)).toBe(true); expect(JSON.stringify(event)).not.toContain('secret-sentinel');
});
it('logging callback failures are contained', () => {
  expect(()=>safeLog(()=>{throw new Error('secret-sentinel');},{requestId:'req-1',decision:'error',latencyMs:0})).not.toThrow();
});
