import {
  buildExpenseReferenceMonthFilter,
  calendarMonthReferenceRange,
  resolveActiveBudgetContext,
} from './active-budget-context.util';
import { toReferenceMonthDate } from '../../me/me.mappers';

describe('active-budget-context expense filters', () => {
  it('calendario: filtra solo el bucket YYYY-MM-01 del mes activo', () => {
    const budget = resolveActiveBudgetContext({
      budgetCycleMode: 'calendar_month',
      budgetCutoffDay: 1,
    });
    const filter = buildExpenseReferenceMonthFilter(
      { budgetCycleMode: 'calendar_month', budgetCutoffDay: 1 },
      budget,
    );
    expect(filter).toEqual(budget.activeMonthDate);
  });

  it('corte: incluye rango periodStart–cutoffDate (legacy 2026-10-01 en periodo sep16–oct15)', () => {
    const pref = { budgetCycleMode: 'monthly_cutoff', budgetCutoffDay: 15 };
    const budget = resolveActiveBudgetContext(pref);
    const filter = buildExpenseReferenceMonthFilter(pref, budget);
    expect(filter).toEqual({
      gte: toReferenceMonthDate(budget.activePeriod.periodStart),
      lte: toReferenceMonthDate(budget.activePeriod.cutoffDate),
    });
    const legacyOct = toReferenceMonthDate('2026-10-01');
    if (typeof filter === 'object' && 'gte' in filter) {
      expect(legacyOct.getTime()).toBeGreaterThanOrEqual(filter.gte.getTime());
      expect(legacyOct.getTime()).toBeLessThanOrEqual(filter.lte.getTime());
    }
  });

  it('historial YYYY-MM: rango cubre día 01 y buckets de corte (ej. 2026-09-16)', () => {
    const range = calendarMonthReferenceRange('2026-09');
    expect(range.gte).toEqual(toReferenceMonthDate('2026-09-01'));
    expect(range.lte).toEqual(toReferenceMonthDate('2026-09-30'));
    const cutoffBucket = toReferenceMonthDate('2026-09-16');
    expect(cutoffBucket.getTime()).toBeGreaterThanOrEqual(range.gte.getTime());
    expect(cutoffBucket.getTime()).toBeLessThanOrEqual(range.lte.getTime());
  });
});
