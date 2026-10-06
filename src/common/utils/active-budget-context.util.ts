import {
  formatYmdInCaracas,
  getBudgetPeriodForCutoffDay,
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

/** Una sola fuente de verdad para listar/crear movimientos del periodo vigente. */
export function resolveActiveBudgetContext(
  pref: {
    budgetCycleMode?: string | null;
    budgetCutoffDay?: number | null;
  } | null,
): ActiveBudgetContext {
  const todayYmd = formatYmdInCaracas();
  const mode = pref?.budgetCycleMode ?? 'calendar_month';
  const cutoffDay = pref?.budgetCutoffDay ?? 1;

  if (mode === 'calendar_month') {
    const activeReferenceMonth = startOfMonthYmdInCaracas();
    return {
      activeReferenceMonth,
      activeMonthDate: toReferenceMonthDate(activeReferenceMonth),
      activePeriod: getBudgetPeriodForCutoffDay(todayYmd, 1),
    };
  }

  const activePeriod = getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);
  return {
    activeReferenceMonth: activePeriod.periodStart,
    activeMonthDate: toReferenceMonthDate(activePeriod.periodStart),
    activePeriod,
  };
}

/** Filtro Prisma para gastos del periodo activo (calendario vs corte). */
export type ExpenseReferenceMonthFilter = Readonly<{ gte: Date; lt: Date }>;

/**
 * Calendario: todo el mes activo (cualquier día en referenceMonth).
 * Corte: cualquier referenceMonth entre inicio y fin del periodo (incluye legacy en -01).
 */
export function buildExpenseReferenceMonthFilter(
  pref: {
    budgetCycleMode?: string | null;
    budgetCutoffDay?: number | null;
  } | null,
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
