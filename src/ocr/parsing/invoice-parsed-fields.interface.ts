/**
 * Campos intermedios tras regex/heurísticas sobre un bloque OCR (Tesseract).
 */
export interface ParsedInvoiceFields {
  amount?: number;
  structuredAmount?: number;
  structuredCurrencyHint: string;
  heuristicAmount?: number;
  heuristicCurrency: string;
  merchant?: string;
  date?: string;
  description?: string;
}
