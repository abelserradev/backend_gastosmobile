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

/** ISO de DolarApi → YYYY-MM-DD en calendario Caracas. */
export function toCaracasYmdFromApiFecha(iso: string): string {
  return formatYmdInCaracas(new Date(iso));
}
