import {
  buildTesseractRawText,
  extractAmountFromText,
  parseInvoiceTextBlob,
} from './invoice-text.parser';

describe('invoice-text.parser', () => {
  it('extrae total en formato venezolano Bs 60.552,00', () => {
    const blob = `FARMATODO C.A.
Fecha: 14/05/2026
TOTAL: Bs 60.552,00`;
    const pf = parseInvoiceTextBlob(blob);
    expect(pf.amount).toBeCloseTo(60552, 0);
    expect(pf.merchant).toMatch(/Farmatodo/i);
    expect(pf.date).toBe('2026-05-14');
  });

  it('formatea rawText con cabecera Tesseract', () => {
    expect(buildTesseractRawText('hola')).toBe('# Tesseract (OCR)\nhola');
  });

  it('detecta monto USD con símbolo $', () => {
    const { amount, currency } = extractAmountFromText('Total $ 25.50');
    expect(amount).toBeCloseTo(25.5, 2);
    expect(currency).toBe('USD');
  });
});
