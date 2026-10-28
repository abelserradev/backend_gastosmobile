import { isTranscriptEmptyOrLetterPoor } from './transcript-signal.util';

describe('isTranscriptEmptyOrLetterPoor', () => {
  it('marca vacío o solo espacios', () => {
    expect(isTranscriptEmptyOrLetterPoor('')).toBe(true);
    expect(isTranscriptEmptyOrLetterPoor('   ')).toBe(true);
  });

  it('marca cadenas cortas sin letras', () => {
    expect(isTranscriptEmptyOrLetterPoor('12.5')).toBe(true);
  });

  it('acepta texto con suficientes letras', () => {
    expect(isTranscriptEmptyOrLetterPoor('Farmacia Central 123')).toBe(false);
  });
});
