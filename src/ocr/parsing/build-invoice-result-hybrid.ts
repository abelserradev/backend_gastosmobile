import type { ParseInvoiceResultDto } from '../dto/parse-invoice-result.dto';
import { calculateInvoiceConfidence } from './invoice-confidence.util';
import {
  isDegenerateTranscript,
  parseInvoiceTextBlob,
  resolveCurrencyForMergedAmount,
  tessTranscriptIsSubstantial,
  transcriptHasBankOperationAmountLine,
} from './invoice-text.parser';
import {
  isDegenerateVlmTranscript,
  looksLikePromptEcho,
  pickVlmParseBlob,
  vlmOutputUnreliableForScoring,
} from './vlm-text.util';

export function buildHybridRawText(
  tesseractText: string,
  glmText: string,
): string {
  const chunks: string[] = [];
  const tt = (tesseractText ?? '').trim();
  const glm = (glmText ?? '').trim();
  if (tt) {
    chunks.push(`# Tesseract (OCR)\n${tt}`);
  }
  if (glm) {
    chunks.push(`# GLM-OCR (Ollama)\n${glm}`);
  }
  return chunks.length > 0 ? chunks.join('\n\n') : tt || glm || '';
}

/**
 * Fusiona Tesseract + glm-ocr: campos estructurados priorizan Tess si ambos tienen valor (`??`),
 * salvo comprobantes Pagomóvil donde sólo el VLM conserva "Monto operación" legible.
 *
 * `rawText` siempre concatena ambos motores (cuando glm devuelve texto): ver `buildHybridRawText`.
 */
export function buildParseInvoiceHybrid(
  tesseractText: string,
  glmRaw: string,
): ParseInvoiceResultDto {
  const tessBlob = tesseractText.trim();
  const vlmParseBlob = pickVlmParseBlob(glmRaw);
  const tessPf = parseInvoiceTextBlob(tessBlob);
  const vlmPf = parseInvoiceTextBlob(vlmParseBlob);
  const tessOk = tessTranscriptIsSubstantial(tessBlob);
  const vlmGarbage =
    (looksLikePromptEcho(glmRaw) && vlmParseBlob.trim().length < 40) ||
    isDegenerateVlmTranscript(glmRaw) ||
    isDegenerateVlmTranscript(vlmParseBlob);

  const tessOpLine = transcriptHasBankOperationAmountLine(tessBlob);
  const vlmOpLine = transcriptHasBankOperationAmountLine(vlmParseBlob);
  const preferVlmBankOpAmount =
    vlmOpLine &&
    !tessOpLine &&
    !vlmGarbage &&
    vlmPf.amount !== undefined &&
    vlmPf.amount > 0;

  let amount = preferVlmBankOpAmount
    ? vlmPf.amount
    : (tessPf.amount ?? vlmPf.amount);
  let merchant = tessPf.merchant ?? vlmPf.merchant;
  let date = tessPf.date ?? vlmPf.date;
  let description = tessPf.description ?? vlmPf.description;

  const currency = resolveCurrencyForMergedAmount(
    amount,
    tessBlob,
    tessPf,
    vlmParseBlob,
    vlmPf,
  );
  const hybridRaw = buildHybridRawText(tesseractText, glmRaw);
  if (!tessOk && vlmGarbage) {
    amount = undefined;
    merchant = undefined;
    date = undefined;
    description = undefined;
  } else if (!tessOk && isDegenerateTranscript(tessBlob)) {
    const onlyVlm = parseInvoiceTextBlob(vlmParseBlob);
    amount = onlyVlm.amount ?? amount;
    merchant = onlyVlm.merchant ?? merchant;
    date = onlyVlm.date ?? date;
    description = onlyVlm.description ?? description;
  }
  const confidence = calculateInvoiceConfidence({
    amount,
    date,
    merchant,
    description,
    rawText: hybridRaw,
    tessText: tesseractText,
    vlmText: glmRaw,
    vlmUnreliable: vlmOutputUnreliableForScoring(glmRaw),
  });
  return {
    amount,
    date,
    merchant,
    description,
    rawText: hybridRaw,
    confidence,
    currency,
  };
}
