import {
  buildExpenseReferenceMonthFilter,
  calendarMonthReferenceRange,
  ReferenceMonthMismatchError,
  resolveActiveBudgetContext,
  resolveExpenseReferenceMonthForRegistration,
} from './active-budget-context.util';
import { getBudgetPeriodForCutoffDay } from './caracas-date';

describe('active-budget-context expense filters', () => {
  it('calendario: rango semiabierto del mes activo', () => {
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

  it('corte: rango semiabierto periodStart–cutoffDate inclusive', () => {
    const pref = { budgetCycleMode: 'monthly_cutoff', budgetCutoffDay: 15 };
    const budget = resolveActiveBudgetContext(pref);
    const filter = buildExpenseReferenceMonthFilter(pref, budget);
    expect(filter.gte).toEqual(
      new Date(`${budget.activePeriod.periodStart}T00:00:00.000Z`),
    );
    const ltExpected = new Date(
      `${budget.activePeriod.cutoffDate}T00:00:00.000Z`,
    );
    ltExpected.setUTCDate(ltExpected.getUTCDate() + 1);
    expect(filter.lt).toEqual(ltExpected);
    const legacyOct = new Date('2026-10-01T00:00:00.000Z');
    expect(legacyOct.getTime()).toBeGreaterThanOrEqual(filter.gte.getTime());
    expect(legacyOct.getTime()).toBeLessThan(filter.lt.getTime());
  });

  it('rango calendario incluye referenceMonth persistido como medianoche UTC', () => {
    const range = calendarMonthReferenceRange('2026-10');
    const midnightFromDb = new Date('2026-10-01T00:00:00.000Z');
    expect(midnightFromDb.getTime()).toBeGreaterThanOrEqual(
      range.gte.getTime(),
    );
    expect(midnightFromDb.getTime()).toBeLessThan(range.lt.getTime());
  });

  it('historial YYYY-MM: rango cubre buckets de corte (ej. 2026-09-16)', () => {
    const range = calendarMonthReferenceRange('2026-09');
    expect(range.gte).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(range.lt).toEqual(new Date(Date.UTC(2026, 9, 1)));
    const cutoffBucket = new Date('2026-09-16T00:00:00.000Z');
    expect(cutoffBucket.getTime()).toBeGreaterThanOrEqual(range.gte.getTime());
    expect(cutoffBucket.getTime()).toBeLessThan(range.lt.getTime());
  });
});

describe('resolveExpenseReferenceMonthForRegistration (REQ-REG)', () => {
  const cutoffPref = {
    budgetCycleMode: 'monthly_cutoff' as const,
    budgetCutoffDay: 5,
  };

  it('corte 5, registro 2026-10-06 → referenceMonth 2026-10-06 aunque pago fuera del periodo', () => {
    const period = getBudgetPeriodForCutoffDay('2026-10-06', 5);
    expect(period.periodStart).toBe('2026-10-06');
    expect(period.cutoffDate).toBe('2026-11-05');

    const ref = resolveExpenseReferenceMonthForRegistration(
      cutoffPref,
      '2026-10-06',
    );
    expect(ref).toBe('2026-10-06');
  });

  it('rechaza referenceMonth cliente distinto al periodStart activo', () => {
    expect(() =>
      resolveExpenseReferenceMonthForRegistration(
        cutoffPref,
        '2026-10-06',
        '2026-09-06',
      ),
    ).toThrow(ReferenceMonthMismatchError);
  });

  it('acepta referenceMonth omitido o igual al activo', () => {
    const ref = resolveExpenseReferenceMonthForRegistration(
      cutoffPref,
      '2026-10-06',
      '2026-10-06',
    );
    expect(ref).toBe('2026-10-06');
  });
});
