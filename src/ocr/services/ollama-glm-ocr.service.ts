import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRetry } from '../../common/utils/retry.util';

/** Transcripción de facturas vía [glm-ocr](https://ollama.com/library/glm-ocr) en Ollama. */
const DEFAULT_RECEIPT_PROMPT = `Text Recognition: Copia exactamente el texto impreso del comprobante en la imagen (ticket o factura).

Reglas:
— Una línea en papel = una línea en tu respuesta.
— Escribe sólo lo que lees (nombres, RIF, fechas, montos, TOTAL).
— No describas la imagen. No inventes líneas.
— Si una línea es ilegible, pon: [ilegible]`;

@Injectable()
export class OllamaGlmOcrService {
  private readonly logger = new Logger(OllamaGlmOcrService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = (this.config.get<string>('OLLAMA_OCR_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') {
      return false;
    }
    const url = this.getBaseUrl();
    return url.length > 0;
  }

  /**
   * Transcribe la imagen; devuelve cadena vacía si Ollama está deshabilitado o falla
   * (el flujo sigue solo con Tesseract).
   */
  async transcribeReceipt(imageBuffer: Buffer): Promise<string> {
    if (!this.isEnabled()) {
      return '';
    }
    const base64 = imageBuffer.toString('base64');
    try {
      const raw = await withRetry(() => this.callChat(base64), {
        maxAttempts: 2,
        delays: [1500, 3000],
      });
      const trimmed = (raw ?? '').trim();
      this.logger.log(`glm-ocr: ${trimmed.length} caracteres`);
      return trimmed;
    } catch (err) {
      this.logger.warn(
        `glm-ocr no disponible, solo Tesseract: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return '';
    }
  }

  private getBaseUrl(): string {
    return (this.config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434')
      .trim()
      .replace(/\/$/, '');
  }

  private getModel(): string {
    return this.config.get<string>('OLLAMA_MODEL')?.trim() || 'glm-ocr';
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('OLLAMA_OCR_TIMEOUT_MS'));
    return Number.isFinite(n) && n > 0 ? n : 120_000;
  }

  private async callChat(base64: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.getTimeoutMs());
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getModel(),
          messages: [
            {
              role: 'user',
              content: DEFAULT_RECEIPT_PROMPT,
              images: [base64],
            },
          ],
          stream: false,
        }),
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as { message?: { content?: string } };
      return (data?.message?.content ?? '').trim();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Ollama glm-ocr no respondió a tiempo');
      }
      throw err;
    }
  }
}
