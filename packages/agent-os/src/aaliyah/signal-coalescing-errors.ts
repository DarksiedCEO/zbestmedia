class SignalCoalescingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SignalCoalescingAccessDeniedError extends SignalCoalescingError {
  constructor() {
    super('Founder access is required for signal coalescing.');
  }
}

export class SignalCoalescingInvalidModeError extends SignalCoalescingError {
  constructor() {
    super('Mode is not allowed for signal coalescing.');
  }
}

export class SignalCoalescingValidationError extends SignalCoalescingError {}
export class SignalCoalescingNotFoundError extends SignalCoalescingError {}
export class SignalCoalescingConflictError extends SignalCoalescingError {}

export class SignalCoalescingInternalError extends SignalCoalescingError {
  constructor(message = 'Signal coalescing failed.') {
    super(message);
  }
}
