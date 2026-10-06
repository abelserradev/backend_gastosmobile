import {
  formatYmdInCaracas,
  getBudgetPeriodForCutoffDay,
  parseYmdToUtcNoon,
  startOfMonthYmdInCaracas,
  type BudgetPeriod,
} from './caracas-date';
import { toReferenceMonthDate } from '../../me/me.mappers';

/** [start, end) en UTC — alineado con columnas @db.Date en Postgres. */
function referenceDateHalfOpenRange(
  startYmd: string,
  endYmdInclusive: string,
): Readonly<{ gte: Date; lt: Date }> {
  const gte = new Date(`${startYmd}T00:00:00.000Z`);
  const lt = new Date(`${endYmdInclusive}T00:00:00.000Z`);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

export interface ActiveBudgetContext {
  activeReferenceMonth: string;
  activeMonthDate: Date;
  activePeriod: BudgetPeriod;
}

export type BudgetCyclePref = {
  budgetCycleMode?: string | null;
  budgetCutoffDay?: number | null;
};

/** Una sola fuente de verdad para listar/crear movimientos del periodo vigente. */
export function resolveActiveBudgetContext(
  pref: BudgetCyclePref | null,
  asOfYmd: string = formatYmdInCaracas(),
): ActiveBudgetContext {
  const mode = pref?.budgetCycleMode ?? 'calendar_month';
  const cutoffDay = pref?.budgetCutoffDay ?? 1;

  if (mode === 'calendar_month') {
    const anchor = parseYmdToUtcNoon(asOfYmd);
    const activeReferenceMonth = startOfMonthYmdInCaracas(anchor);
    return {
      activeReferenceMonth,
      activeMonthDate: toReferenceMonthDate(activeReferenceMonth),
      activePeriod: getBudgetPeriodForCutoffDay(asOfYmd, 1),
    };
  }

  const activePeriod = getBudgetPeriodForCutoffDay(asOfYmd, cutoffDay);
  return {
    activeReferenceMonth: activePeriod.periodStart,
    activeMonthDate: toReferenceMonthDate(activePeriod.periodStart),
    activePeriod,
  };
}

/** REQ-REG-001/002: periodo al registrar; paymentDate no altera el bucket. */
export class ReferenceMonthMismatchError extends Error {
  constructor(
    readonly expectedYmd: string,
    readonly receivedYmd: string,
  ) {
    super(
      `referenceMonth debe ser ${expectedYmd} (periodo activo al registrar), recibido ${receivedYmd}`,
    );
    this.name = 'ReferenceMonthMismatchError';
  }
}

export function resolveExpenseReferenceMonthForRegistration(
  pref: BudgetCyclePref | null,
  registrationYmd: string,
  clientReferenceMonth?: string,
): string {
  const { activeReferenceMonth } = resolveActiveBudgetContext(
    pref,
    registrationYmd,
  );
  if (
    clientReferenceMonth !== undefined &&
    clientReferenceMonth !== activeReferenceMonth
  ) {
    throw new ReferenceMonthMismatchError(
      activeReferenceMonth,
      clientReferenceMonth,
    );
  }
  return activeReferenceMonth;
}

/** Filtro Prisma para gastos del periodo activo (calendario vs corte). */
export type ExpenseReferenceMonthFilter = Readonly<{ gte: Date; lt: Date }>;

/**
 * Calendario: todo el mes activo (cualquier día en referenceMonth).
 * Corte: cualquier referenceMonth entre inicio y fin del periodo (incluye legacy en -01).
 */
export function buildExpenseReferenceMonthFilter(
  pref: BudgetCyclePref | null,
  budget: ActiveBudgetContext,
): ExpenseReferenceMonthFilter {
  const mode = pref?.budgetCycleMode ?? 'calendar_month';
  if (mode === 'calendar_month') {
    const ym = budget.activeReferenceMonth.slice(0, 7);
    return calendarMonthReferenceRange(ym);
  }
  return referenceDateHalfOpenRange(
    budget.activePeriod.periodStart,
    budget.activePeriod.cutoffDate,
  );
}

/** Rango semiabierto del mes calendario YYYY-MM (historial y tablero). */
export function calendarMonthReferenceRange(
  ym: string,
): Readonly<{ gte: Date; lt: Date }> {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const mo = Number(mStr);
  return {
    gte: new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0)),
  };
}
