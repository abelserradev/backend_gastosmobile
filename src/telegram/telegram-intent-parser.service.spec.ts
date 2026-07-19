import { TelegramIntentParserService } from './telegram-intent-parser.service';

describe('TelegramIntentParserService', () => {
  let parser: TelegramIntentParserService;
  const categories = ['Comida', 'Transporte', 'Varios'];
  const sources = ['Salario', 'Freelance', 'Otros'];

  beforeEach(() => {
    parser = new TelegramIntentParserService();
  });

  it('detecta gasto con categoría', () => {
    const intent = parser.parse('gasté 12.50 en comida almuerzo', categories, sources);
    expect(intent.type).toBe('expense');
    expect(intent.amount).toBe(12.5);
    expect(intent.categoryName).toBe('Comida');
  });

  it('detecta ingreso con fuente', () => {
    const intent = parser.parse('recibí 800 de freelance proyecto web', categories, sources);
    expect(intent.type).toBe('income');
    expect(intent.amount).toBe(800);
    expect(intent.sourceName).toBe('Freelance');
  });

  it('detecta consulta de resumen', () => {
    const intent = parser.parse('cuánto llevo gastado este mes?', categories, sources);
    expect(intent.type).toBe('query_summary');
  });

  it('detecta código de vínculo en /vincular', () => {
    const intent = parser.parse('/vincular 123456', categories, sources);
    expect(intent.type).toBe('link');
    expect(intent.linkCode).toBe('123456');
  });

  it('extrae montos con símbolo $', () => {
    expect(parser.extractAmount('pagué $25 en taxi')).toBe(25);
  });
});
