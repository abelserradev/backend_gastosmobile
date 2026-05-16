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

/**
 * Parsea números con separadores de miles/decimales.
 * Formato VE: 60.552,00 (punto=miles, coma=decimal)
 * Formato US: 60,552.00 (coma=miles, punto=decimal)
 */
export function parseLocalizedMoneyToken(token: string): number | undefined {
  const normalized = token.trim();
  if (!normalized) return undefined;

  try {
    // Caso 1: Tiene coma → Formato venezolano (coma=decimal, punto=miles)
    // Ej: "60.552,00" → 60552.00 | "24,79" → 24.79 | "24.792,00" → 24792.00
    if (normalized.includes(',')) {
      const commaIdx = normalized.lastIndexOf(',');
      const afterComma = normalized.slice(commaIdx + 1);
      const beforeComma = normalized.slice(0, commaIdx);

      // Si después de la coma hay 1-2 dígitos → es decimal
      if (/^\d{1,2}$/.test(afterComma)) {
        const whole = beforeComma.replace(/\./g, ''); // quitar separadores de miles
        const result = Number.parseFloat(`${whole}.${afterComma}`);
        return result > 0 ? result : undefined;
      }

      // Si después de la coma hay 3 dígitos → podría ser separador de miles (raro)
      // O si hay más dígitos → tratar todo como número grande
      const allDigits = normalized.replace(/[.,]/g, '');
      const result = Number.parseFloat(allDigits);
      return result > 0 ? result : undefined;
    }

    // Caso 2: Solo puntos → determinar si son miles o decimales
    // Regla: si el último grupo tiene exactamente 3 dígitos → son miles
    // Ej: "24.792" → 24792 (miles) | "24.7" → 24.7 (decimal)
    if (normalized.includes('.') && !normalized.includes(',')) {
      const parts = normalized.split('.');

      // Si el último grupo tiene exactamente 3 dígitos → separador de miles
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        // Es formato venezolano: 24.792 = veinticuatro mil...
        const allDigits = normalized.replace(/\./g, '');
        const result = Number.parseFloat(allDigits);
        return result > 0 ? result : undefined;
      }

      // Si el último grupo tiene 1-2 dígitos → podría ser decimal
      if (lastPart.length <= 2) {
        // Ambiguo: "1.50" podría ser 1.50 USD o 1500 Bs
        // Por defecto asumimos formato US (punto=decimal) pero devolvemos el número
        const result = Number.parseFloat(normalized);
        return result > 0 ? result : undefined;
      }

      // Si hay más de 3 dígitos en el último grupo → número raro, concatenar todo
      const allDigits = normalized.replace(/\./g, '');
      const result = Number.parseFloat(allDigits);
      return result > 0 ? result : undefined;
    }

    // Caso 3: Solo comas → similar a solo puntos pero invertido
    // En VE esto no debería pasar (la coma es decimal), pero por si acaso
    if (normalized.includes(',') && !normalized.includes('.')) {
      const parts = normalized.split(',');
      const lastPart = parts[parts.length - 1];

      // Si el último grupo tiene exactamente 3 dígitos → separador de miles (formato US)
      if (lastPart.length === 3) {
        const allDigits = normalized.replace(/,/g, '');
        const result = Number.parseFloat(allDigits);
        return result > 0 ? result : undefined;
      }

      // Si tiene 1-2 dígitos → decimal
      const result = Number.parseFloat(normalized.replace(/,/g, '.'));
      return result > 0 ? result : undefined;
    }

    // Caso 4: Solo dígitos
    const result = Number.parseFloat(normalized);
    return result > 0 ? result : undefined;

  } catch {
    return undefined;
  }
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
