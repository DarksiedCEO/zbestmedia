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

  checkAndIncrement(tenantId: string): {
    allowed: boolean;
    currentCount: number;
    limitPerMinute: number;
  } {
    const nowMs = this.now();
    const existing = this.windows.get(tenantId);

    if (!existing || nowMs - existing.windowStartMs >= 60_000) {
      this.windows.set(tenantId, { windowStartMs: nowMs, count: 1 });
      return {
        allowed: true,
        currentCount: 1,
        limitPerMinute: this.maxWritesPerMinute
      };
    }

    if (existing.count >= this.maxWritesPerMinute) {
      return {
        allowed: false,
        currentCount: existing.count,
        limitPerMinute: this.maxWritesPerMinute
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      currentCount: existing.count,
      limitPerMinute: this.maxWritesPerMinute
    };
  }
}
