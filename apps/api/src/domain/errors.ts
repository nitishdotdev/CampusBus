export class DomainError extends Error {
  constructor(public readonly status: number, public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'DomainError';
  }
}
export const forbidden = (code = 'FORBIDDEN') => new DomainError(403, code);
export const notFound = (code = 'NOT_FOUND') => new DomainError(404, code);
export const conflict = (code: string) => new DomainError(409, code);
export const tooMany = (code = 'RATE_LIMITED') => new DomainError(429, code);
export const badRequest = (code: string, message?: string) => new DomainError(400, code, message);
