import { ConflictException } from '@nestjs/common';
import { PaymentComparisonService } from './payment-comparison.service';

describe('PaymentComparisonService — EXP-003', () => {
  const service = new PaymentComparisonService();

  it('rechaza editar monto en gasto SELL_RATE', () => {
    expect(() =>
      service.assertAmountEditAllowed(
        { valuationBasis: 'SELL_RATE' },
        { amount: 100 },
      ),
    ).toThrow(ConflictException);
  });

  it('permite editar título sin monto en SELL_RATE', () => {
    expect(() =>
      service.assertAmountEditAllowed({ valuationBasis: 'SELL_RATE' }, {}),
    ).not.toThrow();
  });

  it('permite monto en gasto BCV', () => {
    expect(() =>
      service.assertAmountEditAllowed(
        { valuationBasis: 'BCV' },
        { amount: 50 },
      ),
    ).not.toThrow();
  });
});

describe('PaymentComparisonService — resolveExpenseContext (TD-4)', () => {
  const service = new PaymentComparisonService();

  it('orquesta colaboradores de MeService', async () => {
    const actual = await service.resolveExpenseContext(
      'u1',
      { categoryName: 'Hogar' },
      {
        resolveCategoryId: () => Promise.resolve('c1'),
        resolveProfileId: () => Promise.resolve('p1'),
        getBudgetCyclePrefForUser: () =>
          Promise.resolve({
            budgetCycleMode: 'monthly_cutoff',
            budgetCutoffDay: 5,
          }),
        resolveMovementReferenceMonthYmd: () => '2026-10-06',
      },
    );

    expect(actual).toEqual({
      profileId: 'p1',
      categoryId: 'c1',
      referenceMonth: new Date('2026-10-06T12:00:00.000Z'),
    });
  });
});
