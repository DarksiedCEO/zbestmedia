export class StrategicIntelligenceAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for strategic intelligence.') {
    super(message);
    this.name = 'StrategicIntelligenceAccessDeniedError';
  }
}

export class StrategicIntelligenceInvalidModeError extends Error {
  constructor(message = 'Strategic intelligence is only available in founder mode.') {
    super(message);
    this.name = 'StrategicIntelligenceInvalidModeError';
  }
}

export class StrategicIntelligenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategicIntelligenceValidationError';
  }
}

export class StrategicIntelligenceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategicIntelligenceNotFoundError';
  }
}

export class StrategicIntelligenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategicIntelligenceConflictError';
  }
}

export class StrategicIntelligenceInternalError extends Error {
  constructor(message = 'Strategic intelligence evaluation failed.') {
    super(message);
    this.name = 'StrategicIntelligenceInternalError';
  }
}
