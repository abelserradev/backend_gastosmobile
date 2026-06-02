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

/** Primer día del mes calendario en Caracas (YYYY-MM-01), alineado con `referenceMonth` de gastos. */
export function startOfMonthYmdInCaracas(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}-01`;
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

/** Interface para el periodo presupuestario calculado (FEAT-001). */
export interface BudgetPeriod {
  /** YYYY-MM-DD del inicio del periodo (día después del corte anterior). */
  periodStart: string;
  /** YYYY-MM-DD de la fecha de corte (fin del periodo). */
  cutoffDate: string;
  /** YYYY-MM-DD del inicio del siguiente periodo (día después del corte). */
  nextPeriodStart: string;
  /** Etiqueta legible para UI (ej: "16 May - 15 Jun"). */
  label: string;
  /** Si hoy es día de corte (mostrar renovación). */
  isCutoffToday: boolean;
}

/**
 * Calcula la fecha efectiva de corte considerando días que no existen en todos los meses.
 * Ej: corte día 30 en febrero → usa día 28 o 29 según año.
 */
function getEffectiveCutoffDate(
  year: number,
  month: number, // 0-11
  cutoffDay: number,
): Date {
  // Crear fecha intentando el día de corte
  const candidate = new Date(Date.UTC(year, month, cutoffDay, 12, 0, 0));

  // Si el mes cambió, significa que el día no existe en ese mes
  // (ej: 30 de febrero → cambia a 2 de marzo)
  if (candidate.getUTCMonth() !== month) {
    // Usar el último día del mes
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
    return lastDay;
  }

  return candidate;
}

/**
 * Calcula el periodo presupuestario basado en la fecha de CORTE (fin del periodo).
 *
 * **Lógica de negocio (FEAT-001):**
 * - El usuario cobra en `cutoffDay` → ese día CIERRA el periodo actual.
 * - El nuevo periodo empieza el DÍA DESPUÉS del corte (tablero en blanco).
 * - Ejemplo: corte=15, hoy=2026-05-20 → periodo: 16 May - 15 Jun.
 *
 * @param todayYmd - Fecha de referencia en formato YYYY-MM-DD (Caracas)
 * @param cutoffDay - Día del mes que cierra el periodo (1-28 recomendado)
 * @returns BudgetPeriod con fechas calculadas
 */
export function getBudgetPeriodForCutoffDay(
  todayYmd: string,
  cutoffDay: number,
): BudgetPeriod {
  // Parsear fecha de hoy en UTC noon para evitar problemas de TZ
  const today = parseYmdToUtcNoon(todayYmd);
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth(); // 0-11
  const todayDate = today.getUTCDate();

  // Calcular el corte del mes actual (ej: 15 de mayo)
  const currentMonthCutoff = getEffectiveCutoffDate(
    todayYear,
    todayMonth,
    cutoffDay,
  );
  const currentCutoffDate = currentMonthCutoff.getUTCDate();

  // Determinar si hoy es o pasó el corte del mes actual
  // NOTA: Cuando hoy ES el día de corte, pertenece al periodo que cierra ESE día
  // (no al periodo que empieza al día siguiente)
  const isCutoffToday = todayDate === currentCutoffDate;
  const cutoffPassed = todayDate > currentCutoffDate;

  let periodStart: Date;
  let cutoffDate: Date;
  let nextPeriodStart: Date;

  // Si el corte ya pasó (estrictamente mayor), estamos en el nuevo periodo
  // Si hoy es el corte o es antes, estamos en el periodo actual
  if (cutoffPassed) {
    // Caso: Hoy es el corte O ya pasó el corte del mes actual
    // Estamos en el periodo que empezó DESPUÉS del corte del mes anterior
    // y termina en el corte del mes SIGUIENTE

    // Corte del mes actual ya pasó (o es hoy)
    // El periodo actual empezó el día después del corte del mes actual
    const startOfCurrentPeriod = new Date(
      Date.UTC(todayYear, todayMonth, currentCutoffDate + 1, 12, 0, 0),
    );

    // Si el día después del corte ya es el mes siguiente (ej: corte=31 en mes de 30 días)
    // ajustamos al 1 del mes siguiente
    if (startOfCurrentPeriod.getUTCMonth() !== todayMonth) {
      periodStart = new Date(Date.UTC(todayYear, todayMonth + 1, 1, 12, 0, 0));
    } else {
      periodStart = startOfCurrentPeriod;
    }

    // El corte del periodo actual es el corte del mes SIGUIENTE
    const nextMonth = todayMonth === 11 ? 0 : todayMonth + 1;
    const nextYear = todayMonth === 11 ? todayYear + 1 : todayYear;
    const nextMonthCutoff = getEffectiveCutoffDate(
      nextYear,
      nextMonth,
      cutoffDay,
    );
    cutoffDate = nextMonthCutoff;

    // El siguiente periodo empieza el día después de ese corte
    const startOfNextPeriod = new Date(
      Date.UTC(nextYear, nextMonth, nextMonthCutoff.getUTCDate() + 1, 12, 0, 0),
    );
    if (startOfNextPeriod.getUTCMonth() !== nextMonth) {
      nextPeriodStart = new Date(
        Date.UTC(nextYear, nextMonth + 1, 1, 12, 0, 0),
      );
    } else {
      nextPeriodStart = startOfNextPeriod;
    }
  } else {
    // Caso: Hoy es ANTES del corte del mes actual
    // Estamos en el periodo que empezó DESPUÉS del corte del mes ANTERIOR
    // y termina en el corte de ESTE mes

    // Corte del mes anterior
    const prevMonth = todayMonth === 0 ? 11 : todayMonth - 1;
    const prevYear = todayMonth === 0 ? todayYear - 1 : todayYear;
    const prevMonthCutoff = getEffectiveCutoffDate(
      prevYear,
      prevMonth,
      cutoffDay,
    );

    // Periodo empezó el día después del corte del mes anterior
    const startOfCurrentPeriod = new Date(
      Date.UTC(prevYear, prevMonth, prevMonthCutoff.getUTCDate() + 1, 12, 0, 0),
    );
    if (startOfCurrentPeriod.getUTCMonth() !== prevMonth) {
      periodStart = new Date(Date.UTC(prevYear, prevMonth + 1, 1, 12, 0, 0));
    } else {
      periodStart = startOfCurrentPeriod;
    }

    // Corte del periodo actual es el corte de ESTE mes
    cutoffDate = currentMonthCutoff;

    // El siguiente periodo empieza el día después del corte actual
    const startOfNextPeriod = new Date(
      Date.UTC(todayYear, todayMonth, currentCutoffDate + 1, 12, 0, 0),
    );
    if (startOfNextPeriod.getUTCMonth() !== todayMonth) {
      nextPeriodStart = new Date(
        Date.UTC(todayYear, todayMonth + 1, 1, 12, 0, 0),
      );
    } else {
      nextPeriodStart = startOfNextPeriod;
    }
  }

  // Generar label legible (ej: "16 May - 15 Jun")
  const monthNames = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];
  const startLabel = `${periodStart.getUTCDate()} ${monthNames[periodStart.getUTCMonth()]}`;
  const cutoffLabel = `${cutoffDate.getUTCDate()} ${monthNames[cutoffDate.getUTCMonth()]}`;
  const label = `${startLabel} - ${cutoffLabel}`;

  return {
    periodStart: formatYmdInCaracas(periodStart),
    cutoffDate: formatYmdInCaracas(cutoffDate),
    nextPeriodStart: formatYmdInCaracas(nextPeriodStart),
    label,
    isCutoffToday,
  };
}

/**
 * Determina si hoy es fecha de corte (renovación del periodo).
 *
 * @param todayYmd - Fecha de hoy en formato YYYY-MM-DD
 * @param cutoffDay - Día del mes configurado como corte
 * @returns true si hoy es día de corte
 */
export function isCutoffDay(todayYmd: string, cutoffDay: number): boolean {
  const today = parseYmdToUtcNoon(todayYmd);
  const effectiveCutoff = getEffectiveCutoffDate(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    cutoffDay,
  );
  return todayYmd === formatYmdInCaracas(effectiveCutoff);
}
