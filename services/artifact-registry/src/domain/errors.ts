export class RegistryError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export const Errors = {
  NotFound: (message: string) => new RegistryError("NOT_FOUND", 404, message),
  Conflict: (message: string) => new RegistryError("CONFLICT", 409, message),
  Immutable: (message: string) => new RegistryError("IMMUTABLE", 409, message),
  Validation: (message: string) => new RegistryError("VALIDATION", 400, message)
};
