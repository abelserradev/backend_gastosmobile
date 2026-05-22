import type { ParseInvoiceResultDto } from '../dto/parse-invoice-result.dto';
import { calculateInvoiceConfidence } from './invoice-confidence.util';
import {
  buildTesseractRawText,
  isDegenerateTranscript,
  parseInvoiceTextBlob,
  resolveCurrencyForMergedAmount,
  tessTranscriptIsSubstantial,
} from './invoice-text.parser';

/**
 * Convierte texto Tesseract en el DTO que consume el front (mismo contrato que el OCR Python).
 */
export function buildParseInvoiceFromTesseract(
  tesseractText: string,
): ParseInvoiceResultDto {
  const tessBlob = tesseractText.trim();
  let pf = parseInvoiceTextBlob(tessBlob);
  const tessOk = tessTranscriptIsSubstantial(tessBlob);
  if (!tessOk && isDegenerateTranscript(tessBlob)) {
    pf = {
      structuredCurrencyHint: '',
      heuristicCurrency: '',
    };
  }
  const currency = resolveCurrencyForMergedAmount(pf.amount, tessBlob, pf);
  const rawText = buildTesseractRawText(tesseractText);
  const confidence = calculateInvoiceConfidence({
    amount: pf.amount,
    date: pf.date,
    merchant: pf.merchant,
    description: pf.description,
    rawText,
    tessText: tesseractText,
  });
  return {
    amount: pf.amount,
    date: pf.date,
    merchant: pf.merchant,
    description: pf.description,
    rawText,
    confidence,
    currency,
  };
}
