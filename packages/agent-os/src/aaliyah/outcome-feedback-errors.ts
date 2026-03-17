export class OutcomeFeedbackAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for outcome feedback.') {
    super(message);
    this.name = 'OutcomeFeedbackAccessDeniedError';
  }
}

export class OutcomeFeedbackInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for outcome feedback.') {
    super(message);
    this.name = 'OutcomeFeedbackInvalidModeError';
  }
}

export class OutcomeFeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeFeedbackValidationError';
  }
}

export class OutcomeFeedbackNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeFeedbackNotFoundError';
  }
}

export class OutcomeFeedbackConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeFeedbackConflictError';
  }
}

export class OutcomeFeedbackInternalError extends Error {
  constructor(message = 'Outcome feedback processing failed.') {
    super(message);
    this.name = 'OutcomeFeedbackInternalError';
  }
}
