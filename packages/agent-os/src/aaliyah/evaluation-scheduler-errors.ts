export class EvaluationSchedulerAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for evaluation scheduler actions.') {
    super(message);
  }
}

export class EvaluationSchedulerInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for evaluation scheduler actions.') {
    super(message);
  }
}

export class EvaluationSchedulerValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EvaluationSchedulerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EvaluationSchedulerConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EvaluationSchedulerInternalError extends Error {
  constructor(message = 'Evaluation scheduler failed to complete.') {
    super(message);
  }
}
