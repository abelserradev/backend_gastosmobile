import {
  buildExpenseReferenceMonthFilter,
  calendarMonthReferenceRange,
  resolveActiveBudgetContext,
} from './active-budget-context.util';
describe('active-budget-context expense filters', () => {
  it('calendario: rango del mes activo (no solo igualdad al día 01)', () => {
    const budget = resolveActiveBudgetContext({
      budgetCycleMode: 'calendar_month',
      budgetCutoffDay: 1,
    });
    const filter = buildExpenseReferenceMonthFilter(
      { budgetCycleMode: 'calendar_month', budgetCutoffDay: 1 },
      budget,
    );
    const ym = budget.activeReferenceMonth.slice(0, 7);
    expect(filter).toEqual(calendarMonthReferenceRange(ym));
  });

  it('corte: incluye rango periodStart–cutoffDate (legacy 2026-10-01 en periodo sep16–oct15)', () => {
    const pref = { budgetCycleMode: 'monthly_cutoff', budgetCutoffDay: 15 };
    const budget = resolveActiveBudgetContext(pref);
    const filter = buildExpenseReferenceMonthFilter(pref, budget);
    if (typeof filter !== 'object' || !('gte' in filter)) {
      throw new Error('expected range filter');
    }
    expect(filter.gte).toEqual(
      new Date(`${budget.activePeriod.periodStart}T00:00:00.000Z`),
    );
    expect(filter.lte).toEqual(
      new Date(`${budget.activePeriod.cutoffDate}T23:59:59.999Z`),
    );
    const legacyOct = new Date('2026-10-01T00:00:00.000Z');
    if (typeof filter === 'object' && 'gte' in filter) {
      expect(legacyOct.getTime()).toBeGreaterThanOrEqual(filter.gte.getTime());
      expect(legacyOct.getTime()).toBeLessThanOrEqual(filter.lte.getTime());
    }
  });

  it('rango calendario incluye referenceMonth persistido como medianoche UTC', () => {
    const range = calendarMonthReferenceRange('2026-10');
    const midnightFromDb = new Date('2026-10-01T00:00:00.000Z');
    expect(midnightFromDb.getTime()).toBeGreaterThanOrEqual(
      range.gte.getTime(),
    );
    expect(midnightFromDb.getTime()).toBeLessThanOrEqual(range.lte.getTime());
  });

  it('historial YYYY-MM: rango cubre día 01 y buckets de corte (ej. 2026-09-16)', () => {
    const range = calendarMonthReferenceRange('2026-09');
    expect(range.gte).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(range.lte).toEqual(new Date('2026-09-30T23:59:59.999Z'));
    const cutoffBucket = new Date('2026-09-16T00:00:00.000Z');
    expect(cutoffBucket.getTime()).toBeGreaterThanOrEqual(range.gte.getTime());
    expect(cutoffBucket.getTime()).toBeLessThanOrEqual(range.lte.getTime());
  });
});
