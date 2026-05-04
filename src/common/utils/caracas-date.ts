/** Calendario Venezuela: evita decidir “hoy” solo con UTC. */
export function formatYmdInCaracas(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

export function parseYmdToUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

/** Para YYYY-MM-DD (calendario Caracas); el mercado BCV habitualmente no cotiza fines de semana. */
export function isCaracasWeekendSatOrSun(ymd: string): boolean {
  const d = parseYmdToUtcNoon(ymd);
  const dayShort = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Caracas',
  }).format(d);
  return dayShort === 'Sat' || dayShort === 'Sun';
}

/** ISO de DolarApi → YYYY-MM-DD en calendario Caracas. */
export function toCaracasYmdFromApiFecha(iso: string): string {
  return formatYmdInCaracas(new Date(iso));
}
