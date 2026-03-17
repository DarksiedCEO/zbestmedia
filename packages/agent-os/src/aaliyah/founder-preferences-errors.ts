export class FounderPreferencesAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for founder preferences.') {
    super(message);
    this.name = 'FounderPreferencesAccessDeniedError';
  }
}

export class FounderPreferencesInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for founder preferences.') {
    super(message);
    this.name = 'FounderPreferencesInvalidModeError';
  }
}

export class FounderPreferencesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FounderPreferencesValidationError';
  }
}

export class FounderPreferencesNotFoundError extends Error {
  constructor(message = 'Founder preferences were not found.') {
    super(message);
    this.name = 'FounderPreferencesNotFoundError';
  }
}

export class FounderPreferencesConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FounderPreferencesConflictError';
  }
}

export class FounderPreferencesInternalError extends Error {
  constructor(message = 'Founder preferences failed.') {
    super(message);
    this.name = 'FounderPreferencesInternalError';
  }
}
