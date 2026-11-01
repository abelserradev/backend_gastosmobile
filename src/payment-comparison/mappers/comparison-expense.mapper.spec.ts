import { hashConvertRequest } from './comparison-expense.mapper';

describe('hashConvertRequest (GC-005)', () => {
  it('es estable para el mismo cuerpo', () => {
    const dto = {
      optionId: 'bs' as const,
      title: 'Compra',
      categoryName: 'Hogar',
    };
    const a = hashConvertRequest('cmp-1', dto);
    const b = hashConvertRequest('cmp-1', dto);
    expect(a).toBe(b);
  });

  it('cambia si cambia la opción', () => {
    const base = {
      title: 'Compra',
      categoryName: 'Hogar',
    };
    const h1 = hashConvertRequest('cmp-1', { ...base, optionId: 'bs' });
    const h2 = hashConvertRequest('cmp-1', { ...base, optionId: 'efectivo' });
    expect(h1).not.toBe(h2);
  });
});
