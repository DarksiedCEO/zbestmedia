export class AaliyahTaskAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for task actions.') {
    super(message);
    this.name = 'AaliyahTaskAccessDeniedError';
  }
}

export class AaliyahTaskInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for task actions.') {
    super(message);
    this.name = 'AaliyahTaskInvalidModeError';
  }
}

export class AaliyahTaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AaliyahTaskValidationError';
  }
}

export class AaliyahTaskNotFoundError extends Error {
  constructor(message = 'Task was not found.') {
    super(message);
    this.name = 'AaliyahTaskNotFoundError';
  }
}

export class AaliyahTaskConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AaliyahTaskConflictError';
  }
}

export class AaliyahTaskInternalError extends Error {
  constructor(message = 'Task action failed.') {
    super(message);
    this.name = 'AaliyahTaskInternalError';
  }
}
