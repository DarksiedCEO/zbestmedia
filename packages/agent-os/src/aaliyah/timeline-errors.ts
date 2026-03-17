export class TimelineAccessDeniedError extends Error {
  constructor(message = 'Founder timeline access is denied.') {
    super(message);
    this.name = 'TimelineAccessDeniedError';
  }
}

export class TimelineInvalidModeError extends Error {
  constructor(message = 'Founder timeline only supports founder mode access.') {
    super(message);
    this.name = 'TimelineInvalidModeError';
  }
}

export class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineValidationError';
  }
}

export class TimelineNotFoundError extends Error {
  constructor(message = 'Timeline event was not found.') {
    super(message);
    this.name = 'TimelineNotFoundError';
  }
}

export class TimelineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineConflictError';
  }
}
