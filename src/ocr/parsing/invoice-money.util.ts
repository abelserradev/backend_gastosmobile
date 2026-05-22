/**
 * Montos estilo VE (60.552,00) y USD; portado del servicio Python legacy.
 */

export function inferCurrencyNearAmount(fragmentLower: string): string {
  if (/\bbg\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?/i.test(fragmentLower)) {
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

/**
 * Parsea números con separadores de miles/decimales.
 * Formato VE: 60.552,00 (punto=miles, coma=decimal)
 * Formato US: 60,552.00 (coma=miles, punto=decimal)
 */

function asPositiveAmount(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

/** Con coma: coma como decimal VE si hay 1–2 dígitos finales; si no, se eliminan separadores. */
function parseMoneyTokenWithComma(normalized: string): number | undefined {
  const commaIdx = normalized.lastIndexOf(',');
  const afterComma = normalized.slice(commaIdx + 1);
  const beforeComma = normalized.slice(0, commaIdx);
  if (/^\d{1,2}$/.test(afterComma)) {
    const whole = beforeComma.replaceAll('.', '');
    return asPositiveAmount(Number.parseFloat(`${whole}.${afterComma}`));
  }
  const condensed = normalized.replaceAll('.', '').replaceAll(',', '');
  return asPositiveAmount(Number.parseFloat(condensed));
}

/** Solo puntos: último grupo 3 dígitos → miles VE; 1–2 → decimal; resto → concatena. */
function parseMoneyTokenDotsOnly(normalized: string): number | undefined {
  const parts = normalized.split('.');
  const lastPart = parts.at(-1) ?? '';
  if (lastPart.length === 3) {
    return asPositiveAmount(Number.parseFloat(normalized.replaceAll('.', '')));
  }
  if (lastPart.length <= 2) {
    return asPositiveAmount(Number.parseFloat(normalized));
  }
  return asPositiveAmount(Number.parseFloat(normalized.replaceAll('.', '')));
}

export function parseLocalizedMoneyToken(token: string): number | undefined {
  const normalized = token.trim();
  if (!normalized) {
    return undefined;
  }
  try {
    if (normalized.includes(',')) {
      return parseMoneyTokenWithComma(normalized);
    }
    if (normalized.includes('.')) {
      return parseMoneyTokenDotsOnly(normalized);
    }
    return asPositiveAmount(Number.parseFloat(normalized));
  } catch {
    return undefined;
  }
}

/** VE con grupos miles; debe ir antes del patrón suelto (equivale al `|` izquierdo de un regexp unificado). */
const RE_COMPRESSED_MONEY_VE_GROUPS_FROM_START =
  /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?/;

/** Dígitos con un bloque opcional decimal/miles después de separador. */
const RE_COMPRESSED_SIMPLE_NUMBER_FROM_START = /^\d+(?:[.,]\d+)?/;

/**
 * Extrae todos los números “tipo monto” de un texto ya compacto (sin espacios ni moneda).
 * Sonar marca el regexp unificado por complejidad; aquí repetimos la semántica con dos patrones anchos (~^…) y barrido manual.
 */
function extractCompressedMoneyTokens(fragment: string): string[] {
  const tokens: string[] = [];
  let pos = 0;
  const lim = fragment.length;

  while (pos < lim) {
    const c = fragment.charAt(pos);
    if (c < '0' || c > '9') {
      pos += 1;
      continue;
    }
    const rest = fragment.slice(pos);
    let m = RE_COMPRESSED_MONEY_VE_GROUPS_FROM_START.exec(rest);
    m ??= RE_COMPRESSED_SIMPLE_NUMBER_FROM_START.exec(rest);
    if (!m) {
      pos += 1;
      continue;
    }
    const hit = m[0];
    tokens.push(hit);
    pos += hit.length;
  }

  return tokens;
}

export function parseMoneyFragment(fragment: string): {
  amount?: number;
  currency: string;
} {
  let s = fragment.trim();
  const currency = inferCurrencyNearAmount(s.toLowerCase());
  s = s.replace(/\b(bs\.?|ves|usd)\b\s*/gi, '');
  s = s
    .replaceAll('$', '')
    .replaceAll('\u2009', '')
    .replaceAll(/\s/g, '')
    .trim();
  const numeric = extractCompressedMoneyTokens(s);
  if (!numeric?.length) {
    return { amount: undefined, currency: currency || '' };
  }
  const candidate = numeric.at(-1);
  if (candidate === undefined) {
    return { amount: undefined, currency: currency || '' };
  }
  const amount = parseLocalizedMoneyToken(candidate);
  if (amount === undefined || amount <= 0) {
    return { amount: undefined, currency: currency || '' };
  }
  return { amount, currency: currency || '' };
}

export function dominantBsSignal(low: string): boolean {
  if ((low.match(/\bbs\.?\s*\d/gi) ?? []).length >= 2) {
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
  if (/\bbg\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?/i.test(low)) {
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
