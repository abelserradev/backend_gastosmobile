/** Convierte valores tipo `7d`, `24h`, `3600` (segundos) a milisegundos para `maxAge` de cookie. */
export function jwtExpiresToMaxAgeMs(expiresIn: string): number {
  const trimmed = expiresIn.trim();
  const asNum = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNum) && !/[a-z]/i.test(trimmed)) {
    return asNum * 1000;
  }
  const match = trimmed.match(/^(\d+)\s*([dhms])$/i);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const n = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const seconds =
    unit === 'd'
      ? n * 86400
      : unit === 'h'
        ? n * 3600
        : unit === 'm'
          ? n * 60
          : n;
  return seconds * 1000;
}
