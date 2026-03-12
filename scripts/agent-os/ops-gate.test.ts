import { describe, expect, it } from 'vitest';

import { assertWorkerSloReleaseStatus } from './ops-gate';

describe('agent-os ops release gate', () => {
  it('allows healthy worker SLO status', () => {
    expect(assertWorkerSloReleaseStatus('healthy')).toBe('healthy');
  });

  it('allows warning worker SLO status', () => {
    expect(assertWorkerSloReleaseStatus('warning')).toBe('warning');
  });

  it('fails release gate when worker SLO status is critical', () => {
    expect(() => assertWorkerSloReleaseStatus('critical')).toThrow(
      '[agent-os:ops:smoke] worker SLO status is critical; failing release gate'
    );
  });

  it('fails on invalid worker SLO status values', () => {
    expect(() => assertWorkerSloReleaseStatus('unknown')).toThrow(
      "[agent-os:ops:smoke] worker SLO returned invalid status 'unknown'"
    );
  });
});
