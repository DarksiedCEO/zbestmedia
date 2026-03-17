class OpportunityEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class OpportunityEngineAccessDeniedError extends OpportunityEngineError {
  constructor() {
    super('Founder access is required for opportunity detection.');
  }
}

export class OpportunityEngineInvalidModeError extends OpportunityEngineError {
  constructor() {
    super('Mode is not allowed for opportunity detection.');
  }
}

export class OpportunityEngineValidationError extends OpportunityEngineError {
  constructor(message: string) {
    super(message);
  }
}

export class OpportunityEngineNotFoundError extends OpportunityEngineError {
  constructor(message: string) {
    super(message);
  }
}

export class OpportunityEngineConflictError extends OpportunityEngineError {
  constructor(message: string) {
    super(message);
  }
}

export class OpportunityEngineInternalError extends OpportunityEngineError {
  constructor(message = 'Opportunity evaluation failed.') {
    super(message);
  }
}
