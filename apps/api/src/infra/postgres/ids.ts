import crypto from 'crypto';

export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
export const newId = (): string => crypto.randomBytes(12).toString('hex');
export const isUniqueViolation = (e: unknown, constraint?: string): boolean => {
  const err = e as { code?: string; constraint?: string } | null;
  if (err?.code !== '23505') return false;
  return constraint ? err.constraint === constraint : true;
};
