import type { AaliyahCalendarDenialCode, AaliyahCalendarErrorCode } from "./calendar-types.js";

export class AaliyahCalendarAccessDeniedError extends Error {
  readonly denialCode: AaliyahCalendarDenialCode = "ACCESS_DENIED";

  constructor(message = "Founder access is required for Calendar actions.") {
    super(message);
  }
}

export class AaliyahCalendarInvalidModeError extends Error {
  readonly denialCode: AaliyahCalendarDenialCode = "INVALID_MODE";

  constructor(message = "Mode is not allowed for Calendar actions.") {
    super(message);
  }
}

export class AaliyahCalendarProviderDisabledError extends Error {
  readonly denialCode: AaliyahCalendarDenialCode = "PROVIDER_DISABLED";

  constructor(message = "Calendar integration is disabled.") {
    super(message);
  }
}

export class AaliyahCalendarValidationError extends Error {
  readonly errorCode: AaliyahCalendarErrorCode = "INVALID_INPUT";

  constructor(message = "Calendar input failed validation.") {
    super(message);
  }
}

export class AaliyahCalendarProviderUnavailableError extends Error {
  readonly errorCode: AaliyahCalendarErrorCode = "PROVIDER_UNAVAILABLE";

  constructor(message = "Calendar provider is unavailable.") {
    super(message);
  }
}

export class AaliyahCalendarProviderRejectedError extends Error {
  readonly errorCode: AaliyahCalendarErrorCode = "PROVIDER_REJECTED";

  constructor(message = "Calendar provider rejected the request.") {
    super(message);
  }
}

export class AaliyahCalendarInternalError extends Error {
  readonly errorCode: AaliyahCalendarErrorCode = "INTERNAL_ERROR";

  constructor(message = "Calendar request failed.") {
    super(message);
  }
}
