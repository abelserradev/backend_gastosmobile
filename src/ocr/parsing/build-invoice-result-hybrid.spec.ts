import {
  buildHybridRawText,
  buildParseInvoiceHybrid,
} from './build-invoice-result-hybrid';

describe('build-invoice-result-hybrid', () => {
  it('combina rawText con secciones Tesseract y Cloud OCR', () => {
    const raw = buildHybridRawText('TOTAL 10', 'FARMATODO');
    expect(raw).toContain('# Tesseract (OCR)');
    expect(raw).toContain('# Cloud OCR');
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
    expect(dto.rawText).not.toContain('Cloud OCR');
  });

  it('usa monto glm-ocr cuando sólo el VLM tiene línea Monto operación (Pagomóvil)', () => {
    const tessNoLabel = `Algo de ruido
TOTAL 50.000
Bs 999`;
    const glm = `Monto operación (Bs.): 3.000,00`;
    const dto = buildParseInvoiceHybrid(tessNoLabel, glm);
    expect(dto.amount).toBeCloseTo(3000, 2);
  });

  it('si ambos tienen Monto operación, sigue primero Tesseract', () => {
    const tess = `Monto operación (Bs.): 4.000,00`;
    const glm = `Monto operación (Bs.): 9.999,00`;
    expect(buildParseInvoiceHybrid(tess, glm).amount).toBeCloseTo(4000, 2);
  });

  it('usa VLM cuando sólo él trae Monto (Bs.) tipo Mercantil Tpago', () => {
    const tess = 'Beneficiario 0424';
    const glm = 'Monto (Bs.):\n2.580,00';
    expect(buildParseInvoiceHybrid(tess, glm).amount).toBeCloseTo(2580, 2);
  });
});
