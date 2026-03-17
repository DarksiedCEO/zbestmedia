export class EscalationEngineAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for escalation engine operations.') {
    super(message);
    this.name = 'EscalationEngineAccessDeniedError';
  }
}

export class EscalationEngineInvalidModeError extends Error {
  constructor(message = 'Escalation engine only supports founder and zbestmedia modes.') {
    super(message);
    this.name = 'EscalationEngineInvalidModeError';
  }
}

export class EscalationEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationEngineValidationError';
  }
}

export class EscalationEngineNotFoundError extends Error {
  constructor(message = 'Escalation record was not found.') {
    super(message);
    this.name = 'EscalationEngineNotFoundError';
  }
}

export class EscalationEngineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationEngineConflictError';
  }
}

export class EscalationEngineInternalError extends Error {
  constructor(message = 'Escalation engine failed unexpectedly.') {
    super(message);
    this.name = 'EscalationEngineInternalError';
  }
}
