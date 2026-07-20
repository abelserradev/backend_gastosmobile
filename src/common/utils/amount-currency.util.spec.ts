import { resolveAmountUsd } from './amount-currency.util';

describe('resolveAmountUsd', () => {
  it('devuelve el mismo monto en USD', () => {
    expect(resolveAmountUsd(25, 'USD', 51.5)).toBe(25);
    expect(resolveAmountUsd(25, undefined, 51.5)).toBe(25);
  });

  it('convierte Bs a USD con tasa BCV', () => {
    expect(resolveAmountUsd(5150, 'BS', 51.5)).toBeCloseTo(100, 2);
  });

  it('rechaza tasa inválida al convertir BS', () => {
    expect(() => resolveAmountUsd(100, 'BS', 0)).toThrow('Tasa BCV inválida');
  });
});
