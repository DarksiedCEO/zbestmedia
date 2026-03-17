export class OperatorQueueAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for the operator queue.') {
    super(message);
    this.name = 'OperatorQueueAccessDeniedError';
  }
}

export class OperatorQueueInvalidModeError extends Error {
  constructor(message = 'Operator queue is only available in founder mode.') {
    super(message);
    this.name = 'OperatorQueueInvalidModeError';
  }
}

export class OperatorQueueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorQueueValidationError';
  }
}

export class OperatorQueueNotFoundError extends Error {
  constructor(message = 'Operator queue item was not found.') {
    super(message);
    this.name = 'OperatorQueueNotFoundError';
  }
}

export class OperatorQueueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorQueueConflictError';
  }
}

export class OperatorQueueInternalError extends Error {
  constructor(message = 'Operator queue could not be resolved.') {
    super(message);
    this.name = 'OperatorQueueInternalError';
  }
}
