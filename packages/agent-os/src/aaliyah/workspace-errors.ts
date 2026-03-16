import type { AaliyahWorkspaceDenialCode, AaliyahWorkspaceErrorCode } from "./workspace-types.js";

export class AaliyahWorkspaceAccessDeniedError extends Error {
  readonly denialCode: AaliyahWorkspaceDenialCode = "ACCESS_DENIED";

  constructor(message = "Founder access is required for Gmail drafting.") {
    super(message);
  }
}

export class AaliyahWorkspaceInvalidModeError extends Error {
  readonly denialCode: AaliyahWorkspaceDenialCode = "INVALID_MODE";

  constructor(message = "Mode is not allowed for Gmail drafting.") {
    super(message);
  }
}

export class AaliyahWorkspaceProviderDisabledError extends Error {
  readonly denialCode: AaliyahWorkspaceDenialCode = "PROVIDER_DISABLED";

  constructor(message = "Gmail drafting is disabled.") {
    super(message);
  }
}

export class AaliyahWorkspaceValidationError extends Error {
  readonly errorCode: AaliyahWorkspaceErrorCode = "INVALID_INPUT";

  constructor(message = "Draft input failed validation.") {
    super(message);
  }
}

export class AaliyahWorkspaceProviderUnavailableError extends Error {
  readonly errorCode: AaliyahWorkspaceErrorCode = "PROVIDER_UNAVAILABLE";

  constructor(message = "Gmail drafting provider is unavailable.") {
    super(message);
  }
}

export class AaliyahWorkspaceProviderRejectedError extends Error {
  readonly errorCode: AaliyahWorkspaceErrorCode = "PROVIDER_REJECTED";

  constructor(message = "Gmail drafting provider rejected the request.") {
    super(message);
  }
}

export class AaliyahWorkspaceInternalError extends Error {
  readonly errorCode: AaliyahWorkspaceErrorCode = "INTERNAL_ERROR";

  constructor(message = "Draft creation failed.") {
    super(message);
  }
}
