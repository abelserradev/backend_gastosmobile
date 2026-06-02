/**
 * CORS explícito en producción (validado por env); en dev permite reflejo amplio si no hay FRONTEND_URL.
 */
export function resolveCorsOrigin(raw: string | undefined): boolean | string[] {
  const trimmed = raw?.trim();
  if (trimmed) {
    return trimmed
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}
