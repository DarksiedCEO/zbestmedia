export class NotificationEngineAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for notifications.') {
    super(message);
    this.name = 'NotificationEngineAccessDeniedError';
  }
}

export class NotificationEngineInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for notifications.') {
    super(message);
    this.name = 'NotificationEngineInvalidModeError';
  }
}

export class NotificationEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationEngineValidationError';
  }
}

export class NotificationEngineNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationEngineNotFoundError';
  }
}

export class NotificationEngineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationEngineConflictError';
  }
}

export class NotificationEngineInternalError extends Error {
  constructor(message = 'Notification evaluation failed.') {
    super(message);
    this.name = 'NotificationEngineInternalError';
  }
}
