import { Prisma } from '@prisma/client';
import {
  inferChosenOptionId,
  mapExpenseComparisonDetail,
} from './expense-comparison-detail.mapper';

const comparacionV1 = {
  version: 'v1' as const,
  computedAt: '2026-10-21T18:57:50.037Z',
  producto: 'TV',
  tasas: {
    oficial: { valor: '883', fechaFuente: '2026-10-21T13:00:00.000Z' },
    paralelo: { valor: '1100', fechaFuente: '2026-10-21T13:05:00.000Z' },
    desactualizado: false,
  },
  tasaVenta: { valor: '1100', origen: 'paralelo' as const },
  precioBs: null,
  opciones: [
    {
      id: 'efectivo',
      moneda: 'USD' as const,
      montoCobrado: '380',
      equivalenteBcvUsd: '380',
      comisionPct: null,
      comisionUsd: null,
      costoRealUsd: '380.00',
      costoRealBs: '380',
      diferenciaVsMejorUsd: '0',
      esMejor: true,
    },
    {
      id: 'bs',
      moneda: 'BS' as const,
      montoCobrado: '1',
      equivalenteBcvUsd: '1',
      comisionPct: null,
      comisionUsd: null,
      costoRealUsd: '389.78',
      costoRealBs: '1',
      diferenciaVsMejorUsd: '9.78',
      esMejor: false,
    },
  ],
  mejores: ['efectivo'],
  empateTotal: false,
  ahorroUsd: '0',
  tasaEquilibrio: null,
  recargoBsPct: null,
};

describe('inferChosenOptionId (EXP-002)', () => {
  it('resuelve por paymentMethod y amount', () => {
    const actual = inferChosenOptionId(
      {
        amount: new Prisma.Decimal('380.00'),
        paymentMethod: 'CASH',
      },
      comparacionV1.opciones,
    );
    expect(actual).toBe('efectivo');
  });
});

describe('mapExpenseComparisonDetail', () => {
  it('expone opciones y tasas del snapshot', () => {
    const actual = mapExpenseComparisonDetail(
      {
        id: 'cmp-1',
        contractVersion: 'v1',
        computedAt: new Date('2026-10-21T18:57:50.037Z'),
        productName: 'TV',
        bestOptionId: 'efectivo',
        result: comparacionV1,
      } as never,
      {
        amount: new Prisma.Decimal('380.00'),
        paymentMethod: 'CASH',
      },
    );
    expect(actual.opciones).toHaveLength(2);
    expect(actual.chosenOptionId).toBe('efectivo');
    expect(actual.tasas.oficial.valor).toBe('883');
  });
});
