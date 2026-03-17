export class RecommendationEngineAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for recommendations.') {
    super(message);
    this.name = 'RecommendationEngineAccessDeniedError';
  }
}

export class RecommendationEngineInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for recommendations.') {
    super(message);
    this.name = 'RecommendationEngineInvalidModeError';
  }
}

export class RecommendationEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecommendationEngineValidationError';
  }
}

export class RecommendationEngineNotFoundError extends Error {
  constructor(message = 'Recommendation source was not found.') {
    super(message);
    this.name = 'RecommendationEngineNotFoundError';
  }
}

export class RecommendationEngineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecommendationEngineConflictError';
  }
}

export class RecommendationEngineInternalError extends Error {
  constructor(message = 'Recommendation evaluation failed.') {
    super(message);
    this.name = 'RecommendationEngineInternalError';
  }
}
