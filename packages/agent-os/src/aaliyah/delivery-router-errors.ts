export class DeliveryRouterAccessDeniedError extends Error {
  constructor(message = 'Founder access is required for deliveries.') {
    super(message);
  }
}

export class DeliveryRouterInvalidModeError extends Error {
  constructor(message = 'Mode is not allowed for deliveries.') {
    super(message);
  }
}

export class DeliveryRouterValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DeliveryRouterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DeliveryRouterConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DeliveryRouterInternalError extends Error {
  constructor(message: string) {
    super(message);
  }
}
