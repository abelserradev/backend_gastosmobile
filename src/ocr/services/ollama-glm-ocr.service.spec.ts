import { OllamaGlmOcrService } from './ollama-glm-ocr.service';

describe('OllamaGlmOcrService.resolveInstalledModel', () => {
  let service: OllamaGlmOcrService;

  beforeEach(() => {
    service = new OllamaGlmOcrService({ get: () => undefined } as never);
  });

  it('devuelve coincidencia exacta si existe', () => {
    const actual = service.resolveInstalledModel('glm-ocr:q8_0', [
      'glm-ocr:latest',
      'glm-ocr:q8_0',
    ]);
    expect(actual).toBe('glm-ocr:q8_0');
  });

  it('usa glm-ocr:latest si falta el tag q8_0', () => {
    const actual = service.resolveInstalledModel('glm-ocr:q8_0', [
      'glm-ocr:latest',
      'moondream:1.8b',
    ]);
    expect(actual).toBe('glm-ocr:latest');
  });

  it('resuelve glm-ocr genérico contra variantes instaladas', () => {
    const actual = service.resolveInstalledModel('glm-ocr', ['glm-ocr:q8_0']);
    expect(actual).toBe('glm-ocr:q8_0');
  });

  it('retorna null si no hay familia glm-ocr', () => {
    const actual = service.resolveInstalledModel('glm-ocr:q8_0', [
      'moondream:1.8b',
    ]);
    expect(actual).toBeNull();
  });
});
