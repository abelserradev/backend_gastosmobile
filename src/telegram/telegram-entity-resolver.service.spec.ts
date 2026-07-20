import { TelegramEntityResolverService } from './telegram-entity-resolver.service';
import {
  formatDeleteConfirm,
  formatDeleteExpenseList,
} from './telegram-message.formatter';

describe('TelegramEntityResolverService', () => {
  let resolver: TelegramEntityResolverService;

  const expenses = [
    {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'almuerzo',
      amount: 25,
      category: 'Comida',
    },
    {
      id: '11111111-2222-3333-4444-555555555555',
      title: 'cena',
      amount: 30,
      category: 'Comida',
    },
    {
      id: '99999999-8888-7777-6666-555555555555',
      title: 'taxi',
      amount: 8,
      category: 'Transporte',
    },
  ];

  beforeEach(() => {
    resolver = new TelegramEntityResolverService();
  });

  it('listAllExpenses devuelve hasta MAX_PICKS con labels legibles', () => {
    const picks = resolver.listAllExpenses(expenses);
    expect(picks).toHaveLength(3);
    expect(picks[0].label).toBe('$25.00 · Comida — almuerzo');
    expect(picks[0].kind).toBe('expense');
  });

  it('listAllExpenses respeta el límite de botones Telegram', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      title: `gasto ${i}`,
      amount: i + 1,
      category: 'Varios',
    }));
    const picks = resolver.listAllExpenses(many);
    expect(picks).toHaveLength(TelegramEntityResolverService.MAX_PICKS);
  });

  it('matchExpenses filtra por texto y no devuelve todo sin query', () => {
    const picks = resolver.matchExpenses(expenses, 'taxi');
    expect(picks).toHaveLength(1);
    expect(picks[0].label).toContain('taxi');
  });

  it('matchExpenses sin coincidencias devuelve array vacío', () => {
    expect(resolver.matchExpenses(expenses, 'xyzinexistente')).toHaveLength(0);
  });

  it('toShortId y resolveShortId son reversibles', () => {
    const short = resolver.toShortId(expenses[0].id);
    expect(short).toHaveLength(8);
    expect(resolver.resolveShortId([expenses[0].id], short)).toBe(expenses[0].id);
  });
});

describe('formatDeleteExpenseList', () => {
  const picks = [{ label: '$25.00 · Comida — almuerzo' }];

  it('muestra encabezado de lista filtrada', () => {
    const text = formatDeleteExpenseList('Mar 2026', picks, 5, { filtered: true });
    expect(text).toContain('Gastos que coinciden');
    expect(text).toContain('1. $25.00');
  });

  it('muestra fallback a lista completa', () => {
    const text = formatDeleteExpenseList('Mar 2026', picks, 5, { fallbackFull: true });
    expect(text).toContain('No encontré coincidencias');
  });

  it('formatDeleteConfirm incluye detalle del gasto', () => {
    expect(formatDeleteConfirm('$25.00 · Comida — almuerzo')).toContain(
      '¿Eliminar este gasto?',
    );
  });
});
