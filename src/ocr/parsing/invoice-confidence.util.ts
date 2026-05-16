/**
 * Puntuación de confianza alineada con el servicio Python (sin rama VLM).
 */

export function invoiceTranscriptBonusOk(rawText: string): boolean {
  const stripped = rawText.trim();
  const lc = stripped.toLowerCase();
  const cues = [
    'total',
    'bs.',
    'bs ',
    'bolívar',
    'bolivar',
    'usd',
    'importe',
    'factura',
    'ticket',
    'rif',
    'iva',
    '$',
  ];
  const numericSpreadOk = /\d[\d\s./,-]{10,}/m.test(stripped);
  const lexicalHit = cues.some((chunk) => lc.includes(chunk));
  const headerish = stripped.includes('\n') || (stripped.match(/:/g) ?? []).length >= 2;
  const lengthOk = stripped.length >= 110;
  return lengthOk && numericSpreadOk && lexicalHit && headerish;
}

export function tessTranscriptStrong(tessBody: string): boolean {
  const tessChars = tessBody.trim().length;
  const tessLetters = [...tessBody].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  return tessChars >= 90 || (tessChars >= 40 && tessLetters >= 14);
}

export function calculateInvoiceConfidence(params: {
  amount?: number;
  date?: string;
  merchant?: string;
  description?: string;
  rawText: string;
  tessText: string;
}): number {
  let score = 0;
  if (params.amount !== undefined && params.amount > 0) {
    score += 0.35;
  }
  if (params.date) {
    score += 0.3;
  }
  if (params.merchant) {
    score += 0.2;
  }
  if (params.description) {
    score += 0.05;
  }
  const tessBody = params.tessText ?? '';
  const transcriptSignal = tessTranscriptStrong(tessBody)
    ? true
    : invoiceTranscriptBonusOk(params.rawText);
  if (transcriptSignal) {
    score += 0.1;
  }
  return Math.min(score, 1);
}
