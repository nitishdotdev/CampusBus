export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
export const str = (v: unknown): string => String(v);
export const optStr = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
export function pageOpts(o: { page?: number; pageSize?: number }) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(o.pageSize ?? 25)));
  const page = Math.max(1, Math.floor(o.page ?? 1));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export const isDuplicateKey = (e: unknown): boolean => (e as { code?: number } | null)?.code === 11000;
