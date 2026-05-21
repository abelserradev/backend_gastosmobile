import { buildHybridRawText, buildParseInvoiceHybrid } from './build-invoice-result-hybrid';

describe('build-invoice-result-hybrid', () => {
  it('combina rawText con secciones Tesseract y GLM-OCR', () => {
    const raw = buildHybridRawText('TOTAL 10', 'FARMATODO');
    expect(raw).toContain('# Tesseract (OCR)');
    expect(raw).toContain('# GLM-OCR (Ollama)');
  });

  it('prefiere monto de Tesseract cuando ambos lo detectan', () => {
    const tess = `FARMATODO C.A.
Fecha: 14/05/2026
TOTAL: Bs 60.552,00`;
    const glm = 'TOTAL: Bs 99.999,00';
    const dto = buildParseInvoiceHybrid(tess, glm);
    expect(dto.amount).toBeCloseTo(60552, 0);
    expect(dto.merchant).toMatch(/Farmatodo/i);
  });

  it('solo Tesseract si glm vacío', () => {
    const tess = `FARMATODO C.A.
Fecha: 14/05/2026
TOTAL: $ 12.50`;
    const dto = buildParseInvoiceHybrid(tess, '');
    expect(dto.amount).toBeCloseTo(12.5, 2);
    expect(dto.rawText).toContain('# Tesseract');
    expect(dto.rawText).not.toContain('GLM-OCR');
  });
});
