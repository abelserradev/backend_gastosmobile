/**
 * Montos estilo VE (60.552,00) y USD; portado del servicio Python legacy.
 */

export function inferCurrencyNearAmount(fragmentLower: string): string {
  if (
    /\bbg\s*[\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,4})?/i.test(fragmentLower)
  ) {
    return 'BS';
  }
  if (/(bs\.?|bol[ií]v|ves\b)/i.test(fragmentLower)) {
    return 'BS';
  }
  if (/(usd|\$)/i.test(fragmentLower)) {
    return 'USD';
  }
  return '';
}

export function parseLocalizedMoneyToken(token: string): number | undefined {
  const normalized = token.trim();
  const decimalCommaVe = /^[\d]{1,3}(?:\.[\d]{3})*,\d{1,4}$/.test(normalized);
  try {
    if (decimalCommaVe) {
      const commaIdx = normalized.lastIndexOf(',');
      const main = normalized.slice(0, commaIdx);
      const frac = normalized.slice(commaIdx + 1);
      const whole = main.replace(/\./g, '');
      const result = Number.parseFloat(`${whole}.${frac}`);
      return result > 0 ? result : undefined;
    }
    const decimalDotUs = /^[\d,]+\.\d{1,4}$/.test(normalized);
    const onlyDots = normalized.includes('.') && !normalized.includes(',');
    const lastDotIdx = normalized.lastIndexOf('.');
    const restAfterLastDot =
      lastDotIdx !== -1 ? normalized.slice(lastDotIdx + 1) : '';
    const ambiguousDotAsDecimal =
      onlyDots && lastDotIdx !== -1 && restAfterLastDot.length <= 2;
    if (decimalDotUs || ambiguousDotAsDecimal) {
      const n = Number.parseFloat(normalized.replace(/,/g, ''));
      return n > 0 ? n : undefined;
    }
    if (normalized.includes(',') && !normalized.includes('.')) {
      const n = Number.parseFloat(normalized.replace(/,/g, ''));
      return n > 0 ? n : undefined;
    }
    if (normalized.includes('.') && normalized.includes(',')) {
      if (normalized.lastIndexOf('.') > normalized.lastIndexOf(',')) {
        const n = Number.parseFloat(normalized.replace(/,/g, ''));
        return n > 0 ? n : undefined;
      }
      const swapped = normalized.replace(/\./g, '').replace(',', '.');
      const n = Number.parseFloat(swapped);
      return n > 0 ? n : undefined;
    }
    const strippedAll = normalized.replace(/,/g, '').replace(/\./g, '');
    if (/^\d+$/.test(strippedAll)) {
      const rawF = Number.parseFloat(strippedAll);
      return rawF > 0 ? rawF : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseMoneyFragment(
  fragment: string,
): { amount?: number; currency: string } {
  let s = fragment.trim();
  const currency = inferCurrencyNearAmount(s.toLowerCase());
  s = s.replace(/\b(bs\.?|ves|usd)\b\s*/gi, '');
  s = s.replace(/\$/g, '').replace(/\u2009/g, '').replace(/\s/g, '').trim();
  const numeric = s.match(
    /[\d]{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d+)?/gi,
  );
  if (!numeric?.length) {
    return { amount: undefined, currency: currency || '' };
  }
  const candidate = numeric[numeric.length - 1];
  const amount = parseLocalizedMoneyToken(candidate);
  if (amount === undefined || amount <= 0) {
    return { amount: undefined, currency: currency || '' };
  }
  return { amount, currency: currency || '' };
}

export function dominantBsSignal(low: string): boolean {
  if ((low.match(/\bbs\.?\s*[\d]/gi) ?? []).length >= 2) {
    return true;
  }
  if ((low.match(/\bbs\.?\b/gi) ?? []).length >= 3) {
    return true;
  }
  if (/(bol[ií]var(es)?|\bves\b|tasa\s+bcu|[\s,;]bcu\b)/i.test(low)) {
    if (!/\busd\b/i.test(low) && !low.includes('$')) {
      return true;
    }
  }
  if (/\bbg\s*[\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,4})?/i.test(low)) {
    if (/\bbs\.?/i.test(low)) {
      return true;
    }
  }
  return false;
}

export function inferCurrencyHintFromContext(low: string): string {
  if (dominantBsSignal(low)) {
    return 'BS';
  }
  if (/\bbs(?:\.|,|\s)?/i.test(low)) {
    return 'BS';
  }
  if (/\bbol[ií]v/i.test(low)) {
    return 'BS';
  }
  if (/\busd\b/i.test(low) || low.includes('$')) {
    return 'USD';
  }
  return '';
}

export function resolveInvoiceCurrency(
  rawTextLc: string,
  ...candidates: Array<string | undefined>
): string {
  for (const picked of candidates) {
    if (typeof picked === 'string' && picked.toUpperCase() === 'BS') {
      return 'BS';
    }
  }
  const docHint = inferCurrencyHintFromContext(rawTextLc);
  if (docHint === 'BS') {
    return 'BS';
  }
  for (const cand2 of candidates) {
    if (cand2?.trim()) {
      return cand2.trim().toUpperCase();
    }
  }
  if (docHint) {
    return docHint;
  }
  return 'USD';
}
