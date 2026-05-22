/** Patrón "7d", "24 h", etc.: número + unidad día/hora/min/seg (para maxAge JWT). */
const JWT_EXPIRY_WITH_UNIT_REGEX = /^(\d+)\s*([dhms])$/i;

/** Convierte valores tipo `7d`, `24h`, `3600` (segundos) a milisegundos para `maxAge` de cookie. */
export function jwtExpiresToMaxAgeMs(expiresIn: string): number {
  const trimmed = expiresIn.trim();
  const asNum = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNum) && !/[a-z]/i.test(trimmed)) {
    return asNum * 1000;
  }
  const match = JWT_EXPIRY_WITH_UNIT_REGEX.exec(trimmed);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const n = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let seconds = n;
  switch (unit) {
    case 'd':
      seconds = n * 86400;
      break;
    case 'h':
      seconds = n * 3600;
      break;
    case 'm':
      seconds = n * 60;
      break;
    default:
      // 's': ya en segundos
      break;
  }
  return seconds * 1000;
}
