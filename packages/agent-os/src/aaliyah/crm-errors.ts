import type { AaliyahCrmDenialCode, AaliyahCrmErrorCode } from './crm-types.js';

export class AaliyahCrmAccessDeniedError extends Error {
  readonly denialCode: AaliyahCrmDenialCode = 'ACCESS_DENIED';

  constructor(message = 'Founder access is required for CRM actions.') {
    super(message);
  }
}

export class AaliyahCrmInvalidModeError extends Error {
  readonly denialCode: AaliyahCrmDenialCode = 'INVALID_MODE';

  constructor(message = 'Mode is not allowed for CRM actions.') {
    super(message);
  }
}

export class AaliyahCrmValidationError extends Error {
  readonly errorCode: AaliyahCrmErrorCode = 'INVALID_INPUT';

  constructor(message = 'CRM input failed validation.') {
    super(message);
  }
}

export class AaliyahCrmNotFoundError extends Error {
  readonly errorCode: AaliyahCrmErrorCode = 'NOT_FOUND';

  constructor(message = 'CRM record was not found.') {
    super(message);
  }
}

export class AaliyahCrmConflictError extends Error {
  readonly errorCode: AaliyahCrmErrorCode = 'CONFLICT';

  constructor(message = 'CRM record already exists.') {
    super(message);
  }
}

export class AaliyahCrmInternalError extends Error {
  readonly errorCode: AaliyahCrmErrorCode = 'INTERNAL_ERROR';

  constructor(message = 'CRM request failed.') {
    super(message);
  }
}
