export function isV1Api(): boolean {
  const meta = (import.meta as any)?.env?.VITE_USE_V1_API;
  if (meta === 'true') return true;
  if (typeof process !== 'undefined' && process.env?.VITE_USE_V1_API === 'true') return true;
  if (typeof window !== 'undefined' && (window as any).__VITE_USE_V1_API__ === true) return true;
  return false;
}
