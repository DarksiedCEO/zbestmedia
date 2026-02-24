type TenantWindow = {
  windowStartMs: number;
  count: number;
};

export class TenantWriteBudget {
  private readonly windows = new Map<string, TenantWindow>();

  constructor(
    private readonly maxWritesPerMinute: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  checkAndIncrement(tenantId: string): { allowed: boolean } {
    const nowMs = this.now();
    const existing = this.windows.get(tenantId);

    if (!existing || nowMs - existing.windowStartMs >= 60_000) {
      this.windows.set(tenantId, { windowStartMs: nowMs, count: 1 });
      return { allowed: true };
    }

    if (existing.count >= this.maxWritesPerMinute) {
      return { allowed: false };
    }

    existing.count += 1;
    return { allowed: true };
  }
}
