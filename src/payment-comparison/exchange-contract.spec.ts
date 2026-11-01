import { ExchangeContractError, parseComparacionV1 } from './exchange-contract';

const minimoValido = {
  version: 'v1',
  computedAt: '2026-10-21T18:57:50.037Z',
  producto: null,
  tasas: {
    oficial: { valor: '883', fechaFuente: '2026-10-21T13:00:00.000Z' },
    paralelo: { valor: '1100', fechaFuente: '2026-10-21T13:05:00.000Z' },
    desactualizado: false,
  },
  tasaVenta: { valor: '1100', origen: 'paralelo' },
  precioBs: null,
  opciones: [
    {
      id: 'bs',
      moneda: 'BS',
      montoCobrado: '1',
      equivalenteBcvUsd: '1',
      comisionPct: null,
      comisionUsd: null,
      costoRealUsd: '1',
      costoRealBs: '1',
      diferenciaVsMejorUsd: '0',
      esMejor: true,
    },
  ],
  mejores: ['bs'],
  empateTotal: false,
  ahorroUsd: '0',
  tasaEquilibrio: null,
  recargoBsPct: null,
};

describe('parseComparacionV1', () => {
  it('acepta respuesta v1 mínima', () => {
    const actual = parseComparacionV1(minimoValido);
    expect(actual.version).toBe('v1');
  });

  it('rechaza version distinta', () => {
    expect(() =>
      parseComparacionV1({ ...minimoValido, version: 'v2' }),
    ).toThrow(ExchangeContractError);
  });
});
