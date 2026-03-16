export class FollowThroughEngineAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for follow-through actions.') {
    super(message);
    this.name = 'FollowThroughEngineAccessDeniedError';
  }
}

export class FollowThroughEngineInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for follow-through actions.') {
    super(message);
    this.name = 'FollowThroughEngineInvalidModeError';
  }
}

export class FollowThroughEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FollowThroughEngineValidationError';
  }
}

export class FollowThroughEngineNotFoundError extends Error {
  constructor(message = 'Follow-through source was not found.') {
    super(message);
    this.name = 'FollowThroughEngineNotFoundError';
  }
}

export class FollowThroughEngineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FollowThroughEngineConflictError';
  }
}

export class FollowThroughEngineInternalError extends Error {
  constructor(message = 'Follow-through evaluation failed.') {
    super(message);
    this.name = 'FollowThroughEngineInternalError';
  }
}
