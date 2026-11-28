export class DomainError extends Error {
  constructor(public readonly status: number, public readonly code: string, message?: string, public readonly retryAfterSeconds?: number) {
    super(message ?? code);
    this.name = 'DomainError';
  }
}
export const forbidden = (code = 'FORBIDDEN') => new DomainError(403, code);
export const notFound = (code = 'NOT_FOUND') => new DomainError(404, code);
export const conflict = (code: string) => new DomainError(409, code);
export const tooMany = (code = 'RATE_LIMITED', retryAfterSeconds?: number) => new DomainError(429, code, undefined, retryAfterSeconds);
export const badRequest = (code: string, message?: string) => new DomainError(400, code, message);

/** Thrown by operational readiness when bootstrap has not provisioned any campus. */
export class CampusNotProvisionedError extends Error {
  constructor() {
    super('NO_CAMPUS_PROVISIONED');
    this.name = 'CampusNotProvisionedError';
  }
}
