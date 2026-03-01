export type CircuitBreakerOpts = {
  failureThreshold: number;
  resetAfterMs: number;
};

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failures = 0;
  private openedAt = 0;

  constructor(private readonly opts: CircuitBreakerOpts) {}

  getState() {
    return this.state;
  }

  canRequest(now = Date.now()): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN") {
      if (now - this.openedAt >= this.opts.resetAfterMs) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  onFailure(now = Date.now()): void {
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.opts.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = now;
    }
  }
}
