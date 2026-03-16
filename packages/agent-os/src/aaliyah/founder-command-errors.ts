export class FounderCommandAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for founder commands.') {
    super(message);
    this.name = 'FounderCommandAccessDeniedError';
  }
}

export class FounderCommandInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for founder commands.') {
    super(message);
    this.name = 'FounderCommandInvalidModeError';
  }
}

export class FounderCommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FounderCommandValidationError';
  }
}

export class FounderCommandNotFoundError extends Error {
  constructor(message = 'Founder command target was not found.') {
    super(message);
    this.name = 'FounderCommandNotFoundError';
  }
}

export class FounderCommandConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FounderCommandConflictError';
  }
}

export class FounderCommandInternalError extends Error {
  constructor(message = 'Founder command execution failed.') {
    super(message);
    this.name = 'FounderCommandInternalError';
  }
}
