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
