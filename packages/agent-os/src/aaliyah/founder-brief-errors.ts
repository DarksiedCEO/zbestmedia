export class FounderBriefAccessDeniedError extends Error {
  constructor(message = 'Founder brief access was denied.') {
    super(message);
    this.name = 'FounderBriefAccessDeniedError';
  }
}

export class FounderBriefInvalidModeError extends Error {
  constructor(message = 'Founder brief mode is invalid for this request.') {
    super(message);
    this.name = 'FounderBriefInvalidModeError';
  }
}

export class FounderBriefValidationError extends Error {
  constructor(message = 'Founder brief input was invalid.') {
    super(message);
    this.name = 'FounderBriefValidationError';
  }
}

export class FounderBriefNotFoundError extends Error {
  constructor(message = 'Founder brief was not found.') {
    super(message);
    this.name = 'FounderBriefNotFoundError';
  }
}

export class FounderBriefConflictError extends Error {
  constructor(message = 'Founder brief request conflicted with current state.') {
    super(message);
    this.name = 'FounderBriefConflictError';
  }
}

export class FounderBriefInternalError extends Error {
  constructor(message = 'Founder brief failed unexpectedly.') {
    super(message);
    this.name = 'FounderBriefInternalError';
  }
}
