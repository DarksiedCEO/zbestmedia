export class DigestComposerAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for digest composition.') {
    super(message);
  }
}

export class DigestComposerInvalidModeError extends Error {
  constructor(message = 'Digest composition is only available in founder mode.') {
    super(message);
  }
}

export class DigestComposerValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DigestComposerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DigestComposerConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}
