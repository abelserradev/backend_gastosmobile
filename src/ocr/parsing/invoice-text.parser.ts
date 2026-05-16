import type { ParsedInvoiceFields } from './invoice-parsed-fields.interface';
import {
  inferCurrencyHintFromContext,
  parseMoneyFragment,
  resolveInvoiceCurrency,
} from './invoice-money.util';

const KEYED_LABELS = new Set([
  'items',
  'description',
  'productos',
  'articulos',
]);

function stripTrailingInstructions(fragment: string): string {
  const cleaned = fragment.split('(', 1)[0].trim();
  const parts = cleaned.split(',', 2);
  if (parts[0] && looksLikeCalendarBit(parts[0])) {
    return parts[0].trim();
  }
  return cleaned.trim();
}

function looksLikeCalendarBit(s: string): boolean {
  return /\d{1,4}[/\-.]\d{1,4}[/\-.]\d{2,4}/.test(s);
}

export function extractDateFromText(text: string): string | undefined {
  const patterns = [
    /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g,
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g,
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/g,
  ];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      try {
        let year: number;
        let month: number;
        let day: number;
        if (match[3]?.length === 4) {
          day = Number.parseInt(match[1], 10);
          month = Number.parseInt(match[2], 10);
          year = Number.parseInt(match[3], 10);
        } else {
          year = Number.parseInt(match[1], 10);
          month = Number.parseInt(match[2], 10);
          day = Number.parseInt(match[3], 10);
        }
        const dt = new Date(year, month - 1, day);
        if (
          dt.getFullYear() !== year ||
          dt.getMonth() !== month - 1 ||
          dt.getDate() !== day
        ) {
          continue;
        }
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

export function extractMerchantFromText(text: string): string | undefined {
  const lines = text
    .trim()
    .split('\n')
    .map((ln) => ln.trim())
    .filter(Boolean);
  const labelRx =
    /^\s*(merchant|fecha|date|total|items|articulos|descripción|descripcion)\s*[:\.]/i;
  const excludeWords = [
    'factura comercial',
    'factura de venta',
    'recibo de pago',
    'subtotal',
    'iva',
    'cambio',
    'gracias',
    'vuelva pronto',
  ];
  for (const lineClean of lines.slice(0, 14)) {
    const lc = lineClean.toLowerCase();
    if (
      lc.includes('[note') ||
      lc.includes('not visible') ||
      lc.startsWith('unable') ||
      lc.startsWith('cannot')
    ) {
      continue;
    }
    if (lc.startsWith('reformato')) {
      continue;
    }
    if (labelRx.test(lineClean)) {
      continue;
    }
    const chunkLen = lineClean.length;
    if (chunkLen < 4 || chunkLen > 96) {
      continue;
    }
    const loweredAll = lc.replace(/\s/g, '');
    if (excludeWords.some((bad) => loweredAll.includes(bad.replace(/\s/g, '')))) {
      continue;
    }
    const numericDensity = [...lineClean].filter((c) => /\d/.test(c)).length;
    if (numericDensity >= Math.max(10, Math.floor(chunkLen / 4))) {
      continue;
    }
    const spaced =
      lc.includes('c.a.') ||
      lc.includes('s.a.') ||
      lc.includes(',') ||
      lc.includes('.,')
        ? lineClean.trim()
        : lineClean
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    return spaced;
  }
  return undefined;
}

function normalizeStructuredDateLine(chunk: string): string | undefined {
  const trimmed = stripTrailingInstructions(chunk);
  return extractDateFromText(trimmed);
}

export function extractStructuredFields(text: string): {
  amount?: number;
  currencyFound: string;
  merchant?: string;
  date?: string;
  itemsChunk?: string;
} {
  let amount: number | undefined;
  let currencyFound = '';
  let merchantF: string | undefined;
  let dateStr: string | undefined;
  let itemsChunk: string | undefined;
  const rules: Array<{ rx: RegExp; key: string }> = [
    {
      rx: /^TOTAL(?:\s+A\s+PAGAR|\s+PAGADO)?\s*[:\.]?\s*(.+)$/gim,
      key: 'total',
    },
    { rx: /^DATE\s*[:\.]?\s*(.+)$/gim, key: 'date' },
    { rx: /^MERCHANT\s*[:\.]?\s*(.+)$/gim, key: 'merchant' },
    { rx: /^(?:FECHA)\s*[:\.]?\s*(.+)$/gim, key: 'date_es' },
    {
      rx: /^(?:COMERCIO|TIENDA|NEGOCIO|RAZÓN\s+SOCIAL)\s*[:\.]?\s*(.+)$/gim,
      key: 'merchant_es',
    },
    { rx: /^ITEMS\s*[:\.]?\s*(.+)$/gim, key: 'items_en' },
    { rx: /^ART[IÍ]CULOS\s*[:\.]?\s*(.+)$/gim, key: 'items_es' },
    { rx: /^(?:DESCRIPCIÓN|DESCRIPCION)\s*[:\.]?\s*(.+)$/gim, key: 'desc' },
  ];
  for (const { rx, key } of rules) {
    const finds = [...text.matchAll(rx)];
    if (!finds.length) {
      continue;
    }
    const last = finds[finds.length - 1];
    const chunk = (last[1] ?? '').trim();
    const lowered = chunk.toLowerCase();
    const invisible = ['not visible', 'n/a', 'na', '', 'nv', '---'].includes(
      lowered,
    );
    const visibleNo =
      lowered.startsWith('not visible') ||
      lowered.startsWith('cannot') ||
      lowered.startsWith('unable');
    if (invisible || visibleNo) {
      continue;
    }
    if (key === 'merchant' || key === 'merchant_es') {
      const stripped = stripTrailingInstructions(chunk);
      if (stripped.length > 2) {
        merchantF =
          stripped.length > 120 ? stripped.slice(0, 120) : stripped.trim();
      }
    } else if (key === 'date' || key === 'date_es') {
      const normalized = normalizeStructuredDateLine(chunk);
      if (normalized) {
        dateStr = normalized;
      }
    } else if (key === 'total') {
      const { amount: amt2, currency: curr2 } = parseMoneyFragment(chunk);
      if (amt2 !== undefined && amt2 > 0) {
        amount = amt2;
        currencyFound = (curr2 || currencyFound).trim();
      }
    } else if (key === 'items_en' || key === 'items_es' || key === 'desc') {
      const strippedMeta = stripTrailingInstructions(chunk);
      const lowMeta = strippedMeta.toLowerCase();
      if (lowMeta.startsWith('not visible') || lowMeta.startsWith('cannot')) {
        continue;
      }
      const cand = strippedMeta.trim();
      if (cand.length < 4) {
        continue;
      }
      if (!itemsChunk || cand.length > itemsChunk.length) {
        itemsChunk = cand.slice(0, 400);
      }
    }
  }
  return { amount, currencyFound, merchant: merchantF, date: dateStr, itemsChunk };
}

export function isDegenerateTranscript(text: string): boolean {
  const s = (text ?? '').trim();
  if (s.length === 0) {
    return true;
  }
  const letters = [...s].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  if (s.length < 10 && letters < 2) {
    return true;
  }
  if (
    s.length < 80 &&
    letters < 3 &&
    /^[\d\s.,:$€£\-Bs]+$/i.test(s)
  ) {
    return true;
  }
  if (s.length <= 12 && /^\d{1,6}\.?\d*$/.test(s.replace(/\s/g, ''))) {
    return true;
  }
  return false;
}

export function extractAmountFromText(text: string): {
  amount?: number;
  currency: string;
} {
  const fallbackCur = inferCurrencyHintFromContext(text.toLowerCase()) || 'USD';
  if (isDegenerateTranscript(text)) {
    return { amount: undefined, currency: fallbackCur };
  }
  const currencySeen = inferCurrencyHintFromContext(text.toLowerCase());
  const patterns = [
    /(?:total\s+a\s+pagar|total\s+pagado|total\s+factura|monto\s+total|gran\s+total|importe\s+total)\s*[:\.]?\s*([^\n\r]{1,120})/gi,
    /(?:total|importe\s+factura)[:\.]?\s*Bs\.?\s*([\d\s.,]{3,42})/gi,
    /Bs\.?\s*([\d][\d\s.,]{2,41})/gi,
    /\$\s*([\d][\d\s.,]{1,41})/gi,
    /(?:pagar|cambio|cobr(?:ar)?)\s*[:\.]?\s*([^\n\r]{1,96})/gi,
  ];
  for (const pattern of patterns) {
    const chunks = [...text.matchAll(pattern)];
    if (!chunks.length) {
      continue;
    }
    const candText = (chunks[chunks.length - 1][1] ?? '').trim();
    const { amount: amtOk, currency: curr } = parseMoneyFragment(candText);
    if (amtOk !== undefined) {
      let curOut = (curr?.trim() ? curr : currencySeen) || fallbackCur;
      if (!curOut.trim()) {
        curOut = inferCurrencyHintFromContext(text.toLowerCase()) || 'USD';
      }
      return { amount: amtOk, currency: curOut };
    }
  }
  const { amount: strayAmt, currency: strayCur } = parseMoneyFragment(text);
  if (strayAmt === undefined) {
    return { amount: undefined, currency: fallbackCur };
  }
  const merged = (strayCur || currencySeen || fallbackCur).trim();
  return { amount: strayAmt, currency: merged || 'USD' };
}

export function parseInvoiceTextBlob(parseBlob: string): ParsedInvoiceFields {
  const blob = (parseBlob ?? '').trim();
  if (!blob) {
    return {
      structuredCurrencyHint: '',
      heuristicCurrency: '',
    };
  }
  const structured = extractStructuredFields(blob);
  const heuristic = extractAmountFromText(blob);
  const amountPick =
    structured.amount !== undefined && structured.amount > 0
      ? structured.amount
      : heuristic.amount;
  let merchantPick = structured.merchant ?? extractMerchantFromText(blob);
  const datePick = structured.date ?? extractDateFromText(blob);
  let descriptionPick = structured.itemsChunk;
  if (!descriptionPick) {
    for (const line of blob.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes(':')) {
        continue;
      }
      const colonIdx = trimmed.indexOf(':');
      const heading = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const tail = trimmed.slice(colonIdx + 1).trim();
      if (!KEYED_LABELS.has(heading)) {
        continue;
      }
      const lcTail = tail.toLowerCase();
      if (['not visible', 'nv', '---', ''].includes(lcTail)) {
        continue;
      }
      descriptionPick = tail.slice(0, 520);
      break;
    }
  }
  return {
    amount: amountPick,
    structuredAmount: structured.amount,
    structuredCurrencyHint: structured.currencyFound || '',
    heuristicAmount: heuristic.amount,
    heuristicCurrency: heuristic.currency,
    merchant: merchantPick,
    date: datePick,
    description: descriptionPick,
  };
}

export function tessTranscriptIsSubstantial(blob: string): boolean {
  const s = (blob ?? '').trim();
  if (s.length < 28) {
    return false;
  }
  const letters = [...s].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  return letters >= 10;
}

function amountMatchesSource(
  amount: number | undefined,
  src: number | undefined,
): boolean {
  if (amount === undefined || amount <= 0 || src === undefined) {
    return false;
  }
  return Math.abs(src - amount) < 0.02;
}

export function resolveCurrencyForMergedAmount(
  amount: number | undefined,
  tessBlob: string,
  tessPf: ParsedInvoiceFields,
): string {
  const combinedLc = tessBlob.toLowerCase();
  let sc: string | undefined;
  let hc: string | undefined;
  if (amountMatchesSource(amount, tessPf.amount)) {
    if (
      tessPf.structuredAmount !== undefined &&
      tessPf.structuredAmount > 0 &&
      tessPf.structuredCurrencyHint.trim()
    ) {
      sc = tessPf.structuredCurrencyHint.trim();
    }
    if (
      tessPf.heuristicAmount !== undefined &&
      tessPf.heuristicAmount > 0 &&
      tessPf.heuristicCurrency.trim()
    ) {
      hc = tessPf.heuristicCurrency.trim();
    }
  }
  return resolveInvoiceCurrency(combinedLc, sc, hc);
}

export function buildTesseractRawText(tesseractText: string): string {
  const tt = (tesseractText ?? '').trim();
  if (!tt) {
    return '';
  }
  return `# Tesseract (OCR)\n${tt}`;
}
