/** Vacío o demasiado corto sin letras — heurística compartida OCR Tesseract y VLM. */
export function isTranscriptEmptyOrLetterPoor(text: string): boolean {
  const s = (text ?? '').trim();
  if (s.length === 0) {
    return true;
  }
  const letters = [...s].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  return s.length < 10 && letters < 2;
}
