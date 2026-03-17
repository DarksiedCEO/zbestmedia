export class OperatorActionAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for operator queue actions.') {
    super(message);
    this.name = 'OperatorActionAccessDeniedError';
  }
}

export class OperatorActionInvalidModeError extends Error {
  constructor(message = 'Operator queue actions are only available in founder mode.') {
    super(message);
    this.name = 'OperatorActionInvalidModeError';
  }
}

export class OperatorActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorActionValidationError';
  }
}

export class OperatorActionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorActionNotFoundError';
  }
}

export class OperatorActionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorActionConflictError';
  }
}

export class OperatorActionInternalError extends Error {
  constructor(message = 'Operator action execution failed.') {
    super(message);
    this.name = 'OperatorActionInternalError';
  }
}
