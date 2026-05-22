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

// Patrones que indican una línea de dirección (no del nombre del negocio)
const ADDRESS_LINE_PATTERNS = [
  /\bav(enida)?\.?\s+\w/i,
  /\bcalle\b/i,
  /\bcarrera\b/i,
  /\bedo\.?\s+/i,
  /\b(piso|nivel)\s+\w/i,
  /\bedif(icio)?\.?\b/i,
  /\blocal\s+[a-z0-9-]+/i,
  /\btlf[.:]/i,
  /\btelef/i,
  /\bdirecci[oó]n\s*:/i,
  /\b(urb|aurb)\.?\s+/i,
  /\bcc\s+\w/i,
  /\bchacao\b|\bcaracas\b|\bmiranda\b|\baragua\b|\bzulia\b|\bvalencia\b|\bbarquisimeto\b|\bmaracaibo\b/i,
  /\bpb[-\s]/i,
  /san antonio de los altos/i,
  /\bzona\s+\w/i,
];

// Líneas que son totales/subtotales, no ítems de productos
const SUBTOTAL_LINE_PATTERNS = [
  /\b(total\s+general|total\s+a\s+pagar|gran\s+total|total\s+factura)\b/i,
  /\bsubtotal\b|\bsub-total\b|\bsub\.?ttl\b|\bsubttl\b/i,
  /\bbancos\b/i,
  /^tot\.\./i,
  /\bt\.\s*cambio\b|\bcambio\s+bcv\b/i,
  /\bi\.?v\.?a\.?\b/i,
  /\bbase\s+imponible\b|\bbi\s+g\d/i,
  /\btarj(eta)?\.\s*(débito|debito|crédito|credito|visa|master)/i,
  /\b#\s*items?\s*:/i,
  /\bplazo\s+para\s+devoluci/i,
];

// Líneas de metadatos que no son el nombre del local ni ítems
const METADATA_LINE_PATTERNS = [
  // Organismos / autoridades fiscales
  /^seniat\b/i,
  // Cabeceras de factura
  /^(factura\s*(comercial)?|recibo|ticket)\s*$/i,
  /^(factura\s*:?|n[°º]\s*\d|control\s+n[°º])/i,
  /^(fecha\s*:?|hora\s*:?|caja\s+\d|mesa\s+\d)/i,
  // RIF en distintas formas: "RIF J-000", "RIF/C.I.: V26..."
  /^rif[\s/]/i,
  // Datos del cliente/emisor
  /^(raz[oó]n\s+social\s*:|razon\s+social\s*:)/i,
  /^(cliente|nombre\s*\/?\s*raz[oó]n)/i,
  // Datos internos del POS
  /^tienda\s*:/i,
  /^ticket\s*:/i,
  /^id\s+de\s+orden\s*:/i,
  /^le\s+atendi[oó]\s*:/i,
  /^(venta\s+de|nota\s+de)/i,
  // Cabecera de tabla de ítems
  /^(cant\.?|cantidad|descripci[oó]n|p\.?\s*unitario|precio|total\s*\(bs)/i,
  // Pie de ticket
  /^(impreso\s+por|gracias\s+por|vuelva\s+pronto)/i,
  /^\*\*plazo/i,
  // Códigos/separadores/IDs
  /^\d{6,}$/, // código de barras
  /^[zZ]\d+\w*$/, // ID tipo Z1F0019991
  /^T\d[A-Z\d]{8,}$/, // ID tipo T4XX66111A34LNC4C1MRP
  /^[*=-]{4,}$/, // separadores (*, = o guión repetidos)
  /^\|.*\|$/, // |MESA13|
  // Sucursales/sub-marcas de la tienda principal (no son el nombre del negocio)
  /^farmacia\s+\w+/i,
  /^ccs\s*:/i,
];

function looksLikeAddressLine(line: string): boolean {
  return ADDRESS_LINE_PATTERNS.some((p) => p.test(line));
}

function isSubtotalLine(line: string): boolean {
  return SUBTOTAL_LINE_PATTERNS.some((p) => p.test(line));
}

function isMetadataLine(line: string): boolean {
  return METADATA_LINE_PATTERNS.some((p) => p.test(line));
}

function hasCompanySuffix(line: string): boolean {
  return /\b(c\.a\.?|s\.a\.?|c\.r\.l\.?|corp(oraci[oó]n)?|compañ[ií]a)\b/i.test(
    line,
  );
}

// Una línea de producto tiene texto descriptivo + precio al final
function looksLikeProductLine(line: string): boolean {
  const hasTrailingBsPrice = /bs[\s.]*\d[\d.]*,\d{2}\s*$/i.test(line);
  const hasTrailingAmountVE = /\d{1,3}(?:\.\d{3})+,\d{2}\s*$/.test(line);
  const hasTrailingAmountSimple = /\d+,\d{2}\s*$/.test(line);
  if (!hasTrailingBsPrice && !hasTrailingAmountVE && !hasTrailingAmountSimple) {
    return false;
  }
  if (isSubtotalLine(line) || isMetadataLine(line)) {
    return false;
  }
  // La línea debe tener al menos 4 caracteres de texto no numérico
  const textOnly = line.replace(/[\d.,\s]/g, '');
  return textOnly.length >= 3;
}

function cleanMerchantName(raw: string): string {
  let s = raw;

  // Si la línea contiene un sufijo C.A./S.A./Corp, intentar extraer solo el nombre limpio.
  // Cubre casos como: `ge "Electrónica El Avila, C.A. >` → `Electrónica El Avila, C.A.`
  const suffixRx =
    /([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü\s',.-]{2,80}?\b(?:c\.a\.?|s\.a\.?|c\.r\.l\.?|corp(?:oraci[oó]n)?|compañ[ií]a)\b\.?)/i;
  const merchantWithSuffixCapture = suffixRx.exec(s);
  if (merchantWithSuffixCapture?.[1]) {
    s = merchantWithSuffixCapture[1];
  } else {
    // Sin sufijo: quitar comillas tipográficas y ruido al inicio/fin
    s = s
      .replace(
        /[\u0027\u0022\u2018\u2019\u201C\u201D\u201B\u201F\u00AB\u00BB]/g,
        '',
      )
      .trim();
    // Quitar fragmentos de ruido OCR al inicio: letras minúsculas sueltas antes del nombre
    s = s.replace(/^[^A-ZÁÉÍÓÚÑÜ\d]+/, '').trim();
    // Quitar ruido al final: símbolos o letras sueltas después del punto
    s = s.replace(/[<>=|\s]+$/, '').trim();
    s = s.replace(/\s+[a-z]{1,3}$/, '').trim();
  }

  s = s.replace(/\s+rif\s*:.*$/i, '').trim();

  // Mayúsculas de principio a fin sin acentos: título solo si no hay sufijo típico (C.A., S.A., …)
  const allCaps = s === s.toUpperCase() && !/[áéíóúñ]/.test(s);
  if (allCaps && !hasCompanySuffix(s)) {
    return s
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return s;
}

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

/** Primera revisión del ticket: sufijo jurídico claro sin que la línea sea dirección/metadata. */
function looksLikeExplicitCompanyHeaderLine(line: string): boolean {
  return (
    hasCompanySuffix(line) &&
    !looksLikeAddressLine(line) &&
    !isMetadataLine(line) &&
    line.length >= 4 &&
    line.length <= 100
  );
}

/** Heurística laxa cuando no hay sufijo tipo C.A.; descarta típicos falsos positivos (RIF, tablas…). */
function looksLikeMerchantNameCandidateLine(line: string): boolean {
  if (
    looksLikeAddressLine(line) ||
    isMetadataLine(line) ||
    isSubtotalLine(line)
  ) {
    return false;
  }

  const len = line.length;
  if (len < 4 || len > 100) {
    return false;
  }

  const numericChars = [...line].filter((digit) => /\d/.test(digit)).length;
  const densityThreshold = Math.max(8, Math.floor(len / 3));
  if (numericChars >= densityThreshold) {
    return false;
  }

  if (/^[\d\s.,*=\-|]+$/.test(line)) {
    return false;
  }

  return true;
}

export function extractMerchantFromText(text: string): string | undefined {
  const lines = text
    .trim()
    .split('\n')
    .map((ln) => ln.trim())
    .filter(Boolean);

  const headLines = lines.slice(0, 8);

  for (const line of headLines) {
    if (looksLikeExplicitCompanyHeaderLine(line)) {
      return cleanMerchantName(line);
    }
  }

  for (const line of headLines) {
    if (looksLikeMerchantNameCandidateLine(line)) {
      return cleanMerchantName(line);
    }
  }

  return undefined;
}

/**
 * Limpia precios y artefactos de una línea de producto, dejando solo el nombre descriptivo.
 */
function cleanProductName(line: string): string {
  return line
    .replace(/bs[\s.]*[\d.,]+/gi, '') // "Bs 1.065,89"
    .replace(/\d{1,3}(?:\.\d{3})+,\d{2}/g, '') // "14.500,00" formato VE miles+decimal
    .replace(/\d+,\d{2}/g, '') // "X,XX" decimales simples
    .replace(/\(bs\.?\)/gi, '') // "(Bs.)"
    .replace(/p\.\s*unitario/gi, '') // cabecera de columna residual
    .replace(/^\d+\s+/, '') // cantidad inicial "1  Lavadora..."
    .replace(/\(G\)/gi, '') // sufijo POS venezolano
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Estrategia A: factura formal con tabla (tiene cabecera CANT./DESCRIPCIÓN).
 * Busca la sección de ítems delimitada por la cabecera y el primer subtotal.
 * Esto cubre casos donde Tesseract separa nombre y precio en líneas distintas.
 */
function extractItemsFromTableSection(lines: string[]): string[] {
  // Detectar la línea de cabecera de la tabla de productos
  const headerIdx = lines.findIndex(
    (l) =>
      /^(cant\.?|cantidad)\b/i.test(l) ||
      /\bdescripci[oó]n\b.*\bp\.?\s*unitario\b/i.test(l),
  );
  if (headerIdx === -1) return [];

  // El bloque termina en el primer subtotal real (SUB-TOTAL, TOTAL GENERAL, etc.).
  // NO usar /^total\b/i porque "TOTAL (Bs.)" puede ser parte del encabezado de la tabla
  // y causaría que se detecte como fin de sección antes de leer cualquier producto.
  const subtotalIdx = lines.findIndex(
    (l, i) => i > headerIdx && isSubtotalLine(l),
  );
  const endIdx =
    subtotalIdx === -1 ? Math.min(headerIdx + 25, lines.length) : subtotalIdx;

  const items: string[] = [];
  for (let i = headerIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (isMetadataLine(line)) continue;
    if (isSubtotalLine(line)) break;
    if (looksLikeAddressLine(line)) continue;

    const cleaned = cleanProductName(line);

    // Descartar si lo que queda son solo dígitos, símbolos o texto muy corto
    const textOnly = cleaned.replace(/[\d\s.,-]/g, '');
    if (textOnly.length < 3) continue;

    items.push(cleaned);
  }
  return items;
}

/**
 * Estrategia B: ticket POS (sin tabla explícita).
 * Busca líneas con nombre descriptivo + precio al final (Bs X.XXX,XX).
 */
function extractPosStyleItems(lines: string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    if (looksLikeAddressLine(line)) continue;
    if (isSubtotalLine(line)) continue;
    if (isMetadataLine(line)) continue;
    if (!looksLikeProductLine(line)) continue;

    const cleaned = cleanProductName(line);
    const textOnly = cleaned.replace(/[\d\s.,-]/g, '');
    if (textOnly.length >= 3) {
      items.push(cleaned);
    }
  }
  return items;
}

/**
 * Extrae las líneas de productos/ítems del texto OCR.
 * Usa estrategia A (sección de tabla) para facturas formales,
 * y estrategia B (líneas con precio) para tickets POS.
 * Así cubre tanto "Electrónica El Ávila" como tickets de restaurante/farmacia.
 */
export function extractProductItemsFromText(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Intentar primero con tabla estructurada (facturas formales con CANT./DESCRIPCIÓN)
  const tableItems = extractItemsFromTableSection(lines);
  if (tableItems.length > 0) {
    const unique = [...new Set(tableItems)].slice(0, 5);
    return unique.join(', ');
  }

  // Fallback para tickets POS donde cada línea tiene nombre + precio juntos
  const posItems = extractPosStyleItems(lines);
  if (!posItems.length) return undefined;

  const unique = [...new Set(posItems)].slice(0, 5);
  return unique.join(', ');
}

function normalizeStructuredDateLine(chunk: string): string | undefined {
  const trimmed = stripTrailingInstructions(chunk);
  return extractDateFromText(trimmed);
}

const STRUCTURED_FIELD_RULES: Array<{ rx: RegExp; key: string }> = [
  {
    rx: /^TOTAL(?:\s+A\s+PAGAR|\s+PAGADO)?\s*[:.]?\s*(.+)$/gim,
    key: 'total',
  },
  { rx: /^DATE\s*[:.]?\s*(.+)$/gim, key: 'date' },
  { rx: /^MERCHANT\s*[:.]?\s*(.+)$/gim, key: 'merchant' },
  { rx: /^(?:FECHA)\s*[:.]?\s*(.+)$/gim, key: 'date_es' },
  {
    // Solo "COMERCIO:" / "NEGOCIO:" como label explícito del vendedor.
    // "TIENDA:" excluido: es código interno (p. ej. "Tienda: 2119").
    // "RAZON SOCIAL:" excluido: en tickets VE es el COMPRADOR, no el vendedor.
    rx: /^(?:COMERCIO|NEGOCIO)\s*[:.]?\s*(.+)$/gim,
    key: 'merchant_es',
  },
  { rx: /^ITEMS\s*[:.]?\s*(.+)$/gim, key: 'items_en' },
  { rx: /^ART[IÍ]CULOS\s*[:.]?\s*(.+)$/gim, key: 'items_es' },
  { rx: /^(?:DESCRIPCIÓN|DESCRIPCION)\s*[:.]?\s*(.+)$/gim, key: 'desc' },
];

interface StructuredScanState {
  amount?: number;
  currencyFound: string;
  merchant?: string;
  date?: string;
  itemsChunk?: string;
}

function shouldSkipStructuredOcrChunk(chunk: string): boolean {
  const lowered = chunk.toLowerCase();
  if (['not visible', 'n/a', 'na', '', 'nv', '---'].includes(lowered)) {
    return true;
  }
  return (
    lowered.startsWith('not visible') ||
    lowered.startsWith('cannot') ||
    lowered.startsWith('unable')
  );
}

function mergeMerchantFromStructured(
  chunk: string,
  state: StructuredScanState,
): void {
  const stripped = stripTrailingInstructions(chunk).trim();
  if (stripped.length <= 2) {
    return;
  }
  if (/^\d+$/.test(stripped)) {
    return;
  }
  state.merchant = stripped.length > 120 ? stripped.slice(0, 120) : stripped;
}

function mergeDateFromStructured(
  chunk: string,
  state: StructuredScanState,
): void {
  const normalized = normalizeStructuredDateLine(chunk);
  if (normalized) {
    state.date = normalized;
  }
}

function mergeTotalFromStructured(
  chunk: string,
  state: StructuredScanState,
): void {
  const { amount: parsedAmount, currency: parsedCurrency } =
    parseMoneyFragment(chunk);
  if (parsedAmount === undefined || parsedAmount <= 0) {
    return;
  }
  state.amount = parsedAmount;
  state.currencyFound = (parsedCurrency || state.currencyFound).trim();
}

function mergeItemsChunkFromStructured(
  chunk: string,
  state: StructuredScanState,
): void {
  const cand = stripTrailingInstructions(chunk).trim();
  if (shouldSkipStructuredOcrChunk(cand) || cand.length < 4) {
    return;
  }
  if (!state.itemsChunk || cand.length > state.itemsChunk.length) {
    state.itemsChunk = cand.slice(0, 400);
  }
}

function applyStructuredRuleHit(
  key: string,
  chunk: string,
  state: StructuredScanState,
): void {
  switch (key) {
    case 'merchant':
    case 'merchant_es':
      mergeMerchantFromStructured(chunk, state);
      return;
    case 'date':
    case 'date_es':
      mergeDateFromStructured(chunk, state);
      return;
    case 'total':
      mergeTotalFromStructured(chunk, state);
      return;
    case 'items_en':
    case 'items_es':
    case 'desc':
      mergeItemsChunkFromStructured(chunk, state);
      return;
    default:
      return;
  }
}

export function extractStructuredFields(text: string): {
  amount?: number;
  currencyFound: string;
  merchant?: string;
  date?: string;
  itemsChunk?: string;
} {
  const state: StructuredScanState = { currencyFound: '' };

  for (const { rx, key } of STRUCTURED_FIELD_RULES) {
    const hits = [...text.matchAll(rx)];
    const row = hits.at(-1);
    if (!row) {
      continue;
    }

    const chunk = (row[1] ?? '').trim();
    if (shouldSkipStructuredOcrChunk(chunk)) {
      continue;
    }

    applyStructuredRuleHit(key, chunk, state);
  }

  return {
    amount: state.amount,
    currencyFound: state.currencyFound,
    merchant: state.merchant,
    date: state.date,
    itemsChunk: state.itemsChunk,
  };
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
  if (s.length < 80 && letters < 3 && /^[\d\s.,:$€£\-Bs]+$/i.test(s)) {
    return true;
  }
  if (s.length <= 12 && /^\d{1,6}\.?\d*$/.test(s.replace(/\s/g, ''))) {
    return true;
  }
  return false;
}

/** Varias rutas cortas evitan una sola regex con alteración muy costosa para Sonar. */
const LABELED_TOTAL_PATTERNS: RegExp[] = [
  /\btotal\s+a\s+pagar\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /\btotal\s+pagado\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /\btotal\s+factura\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /\bmonto\s+total\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /\bgran\s+total\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /\bimporte\s+total\s*[:.]?\s*([^\n\r]{1,120})/gi,
  /(?:total|importe\s+factura)[:.]?\s*Bs\.?\s*([\d\s.,]{3,42})/gi,
  /Bs\.?\s*(\d[\d\s.,]{2,41})/gi,
  /\$\s*(\d[\d\s.,]{1,41})/gi,
  /(?:pagar|cambio|cobr(?:ar)?)\s*[:.]?\s*([^\n\r]{1,96})/gi,
];

/** Monto desde líneas etiquetadas (total/importe/etc.); aislar reduce complejidad en el extractor público. */
function extractAmountFromLabeledPatterns(
  text: string,
  fallbackCurrency: string,
  currencyHint?: string,
): { amount: number; currency: string } | undefined {
  const lc = text.toLowerCase();
  for (const pattern of LABELED_TOTAL_PATTERNS) {
    const chunks = [...text.matchAll(pattern)];
    const lastHit = chunks.at(-1);
    if (!lastHit) {
      continue;
    }
    const candText = (lastHit[1] ?? '').trim();
    const { amount: amountOk, currency: curr } = parseMoneyFragment(candText);
    if (amountOk === undefined) {
      continue;
    }
    let currencyOut = (curr?.trim() ? curr : currencyHint) || fallbackCurrency;
    if (!currencyOut.trim()) {
      currencyOut = inferCurrencyHintFromContext(lc) || 'USD';
    }
    return { amount: amountOk, currency: currencyOut };
  }
  return undefined;
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
  const labeled = extractAmountFromLabeledPatterns(
    text,
    fallbackCur,
    currencySeen,
  );
  if (labeled) {
    return labeled;
  }
  const { amount: strayAmt, currency: strayCur } = parseMoneyFragment(text);
  if (strayAmt === undefined) {
    return { amount: undefined, currency: fallbackCur };
  }
  const merged = (strayCur || currencySeen || fallbackCur).trim();
  return { amount: strayAmt, currency: merged || 'USD' };
}

function descriptionFromKeyedLabelLines(blob: string): string | undefined {
  for (const line of blob.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.includes(':')) continue;
    const colonIdx = trimmed.indexOf(':');
    const heading = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const tail = trimmed.slice(colonIdx + 1).trim();
    if (!KEYED_LABELS.has(heading)) continue;
    const lcTail = tail.toLowerCase();
    if (['not visible', 'nv', '---', ''].includes(lcTail)) continue;
    return tail.slice(0, 520);
  }
  return undefined;
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
  const merchantPick = structured.merchant ?? extractMerchantFromText(blob);
  const datePick = structured.date ?? extractDateFromText(blob);
  // Primero intentar desde labels estructurados (formato VLM legacy: ITEMS:, DESCRIPCION:)
  let descriptionPick = structured.itemsChunk;

  // Si no hay labels explícitos, buscar por palabras clave simples
  if (!descriptionPick) {
    descriptionPick = descriptionFromKeyedLabelLines(blob);
  }

  // Fallback principal para texto Tesseract: extraer líneas de productos con precio
  if (!descriptionPick) {
    descriptionPick = extractProductItemsFromText(blob);
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
  vlmBlob?: string,
  vlmPf?: ParsedInvoiceFields,
): string {
  const combinedLc = `${tessBlob}\n${vlmBlob ?? ''}`.toLowerCase();
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
  } else if (vlmPf && amountMatchesSource(amount, vlmPf.amount)) {
    if (
      vlmPf.structuredAmount !== undefined &&
      vlmPf.structuredAmount > 0 &&
      vlmPf.structuredCurrencyHint.trim()
    ) {
      sc = vlmPf.structuredCurrencyHint.trim();
    }
    if (
      vlmPf.heuristicAmount !== undefined &&
      vlmPf.heuristicAmount > 0 &&
      vlmPf.heuristicCurrency.trim()
    ) {
      hc = vlmPf.heuristicCurrency.trim();
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
