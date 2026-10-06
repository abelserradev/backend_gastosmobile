import {
  formatYmdInCaracas,
  getBudgetPeriodForCutoffDay,
  startOfMonthYmdInCaracas,
  type BudgetPeriod,
} from './caracas-date';
import { toReferenceMonthDate } from '../../me/me.mappers';

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
export type ExpenseReferenceMonthFilter =
  Date | Readonly<{ gte: Date; lte: Date }>;

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
  return {
    gte: toReferenceMonthDate(budget.activePeriod.periodStart),
    lte: toReferenceMonthDate(budget.activePeriod.cutoffDate),
  };
}

/** Rango [primer día, último día] de un mes calendario YYYY-MM (historial). */
export function calendarMonthReferenceRange(
  ym: string,
): Readonly<{ gte: Date; lte: Date }> {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const mo = Number(mStr);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const dayPad = String(lastDay).padStart(2, '0');
  return {
    gte: toReferenceMonthDate(`${ym}-01`),
    lte: toReferenceMonthDate(`${ym}-${dayPad}`),
  };
}
