import { buildMoneyEntryCoreUpdateFields } from './money-entry-update.util';

describe('buildMoneyEntryCoreUpdateFields', () => {
  const bcv = {
    getVesPerUsdForCalendarDay: jest.fn().mockResolvedValue({
      vesPerUsd: { toString: () => '100' },
      rateDate: new Date('2026-10-21T12:00:00.000Z'),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('solo título cuando no hay monto', async () => {
    const actual = await buildMoneyEntryCoreUpdateFields(bcv as never, {
      title: '  Farmacia  ',
    });
    expect(actual).toEqual({ title: 'Farmacia' });
    expect(bcv.getVesPerUsdForCalendarDay).not.toHaveBeenCalled();
  });

  it('incluye patch BCV cuando hay monto', async () => {
    const actual = await buildMoneyEntryCoreUpdateFields(bcv as never, {
      amount: 50,
      amountCurrency: 'USD',
    });
    expect(actual.amount).toBe(50);
    expect(actual.bcvRateApplied).toBeDefined();
    expect(bcv.getVesPerUsdForCalendarDay).toHaveBeenCalled();
  });
});
