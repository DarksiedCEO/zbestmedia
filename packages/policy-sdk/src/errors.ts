export class PolicySdkError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(code: string, message: string, opts?: { status?: number; details?: unknown }) {
    super(message);
    this.name = "PolicySdkError";
    this.code = code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

export const isRetryableStatus = (s: number) => s === 429 || s === 502 || s === 503 || s === 504;
export const isRetryableNetworkCode = (code: string) =>
  ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(code);
