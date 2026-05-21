/** Filtros de respuesta VLM (glm-ocr / Moondream): eco del prompt y transcripciones vacías. */

const ECHO_LINE_PATTERNS = [
  /en la foto/i,
  /instrucciones m[ií]nimas/i,
  /\breformato\b/i,
  /paso cr[ií]tico/i,
  /rules reminder/i,
  /english summary/i,
  /no esquir/i,
  /^\s*\d+\.\s*EN LA FOTO/i,
];

const PROMPT_ECHO_CUES = [
  'en la foto (español',
  'instrucciones mínimas',
  'instrucciones minimas',
  'paso crítico (español',
  'rules reminder',
];

const LOW_SIGNAL_MARKERS = [
  '[note:',
  'cannot read',
  "can't read",
  'can not see',
  'exact content is not visible',
  'image is blurry',
  'no visible text',
  'unable to ',
  'i cannot ',
];

export function looksLikePromptEcho(text: string): boolean {
  const low = text.toLowerCase();
  if (PROMPT_ECHO_CUES.some((m) => low.includes(m))) {
    return true;
  }
  const lines = text.split('\n').filter((ln) => ln.trim());
  if (lines.length < 2) {
    return false;
  }
  const echoHits = lines.filter((ln) =>
    ECHO_LINE_PATTERNS.some((rx) => rx.test(ln)),
  ).length;
  return echoHits >= Math.max(2, Math.floor(lines.length / 3));
}

export function filterEchoLinesForParsing(text: string): string {
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    if (ECHO_LINE_PATTERNS.some((rx) => rx.test(line))) {
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n').trim();
}

export function isLowSignalVlmAnswer(raw: string): boolean {
  const condensed = raw.toLowerCase().trim();
  if (condensed.length < 15) {
    return true;
  }
  if (LOW_SIGNAL_MARKERS.some((m) => condensed.includes(m))) {
    return true;
  }
  if (condensed.startsWith('[') && condensed.slice(0, 80).includes('note')) {
    return true;
  }
  return false;
}

export function isDegenerateVlmTranscript(text: string): boolean {
  const s = (text ?? '').trim();
  if (s.length === 0) {
    return true;
  }
  const letters = [...s].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  if (s.length < 10 && letters < 2) {
    return true;
  }
  if (/^\d+\.?\s*$/.test(s)) {
    return true;
  }
  return false;
}

export function vlmOutputUnreliableForScoring(raw: string): boolean {
  return (
    isLowSignalVlmAnswer(raw) ||
    isDegenerateVlmTranscript(raw) ||
    (looksLikePromptEcho(raw) && raw.trim().length < 40)
  );
}

export function pickVlmParseBlob(vlmRaw: string): string {
  const filtered = filterEchoLinesForParsing(vlmRaw);
  if (looksLikePromptEcho(vlmRaw)) {
    return filtered;
  }
  return filtered.trim().length >= 4 ? filtered : vlmRaw;
}
