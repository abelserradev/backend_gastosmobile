import { existsSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRetry } from '../../common/utils/retry.util';

/** Transcripción de facturas vía [glm-ocr](https://ollama.com/library/glm-ocr) en Ollama. */
const DEFAULT_RECEIPT_PROMPT = `Text Recognition: Copia exactamente el texto impreso del comprobante en la imagen (ticket o factura).

Reglas:
— Una línea en papel = una línea en tu respuesta.
— Escribe sólo lo que lees (nombres, RIF, fechas, montos, TOTAL).
— No describas la imagen. No inventes líneas.
— Si una línea es ilegible, pon: [ilegible]`;

const DOCKER_OLLAMA_HOST = 'http://ollama:11434';

@Injectable()
export class OllamaGlmOcrService implements OnModuleInit {
  private readonly logger = new Logger(OllamaGlmOcrService.name);
  private resolvedBaseUrl = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.resolvedBaseUrl = this.resolveBaseUrl();
    if (!this.isEnabled()) {
      this.logger.log('OCR glm-ocr deshabilitado (OLLAMA_OCR_ENABLED)');
      return;
    }
    this.logger.log(
      `OCR glm-ocr: modelo=${this.getModel()}, url=${this.resolvedBaseUrl}`,
    );
    void this.probeOllamaReachable();
  }

  isEnabled(): boolean {
    const flag = (this.config.get<string>('OLLAMA_OCR_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') {
      return false;
    }
    return this.resolveBaseUrl().length > 0;
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
    const baseUrl = this.resolveBaseUrl();
    try {
      const raw = await withRetry(() => this.callChat(base64, baseUrl), {
        maxAttempts: 2,
        delays: [1500, 3000],
      });
      const trimmed = (raw ?? '').trim();
      this.logger.log(`glm-ocr: ${trimmed.length} caracteres`);
      return trimmed;
    } catch (err) {
      const detail = this.formatFetchError(err, baseUrl);
      this.logger.warn(`glm-ocr no disponible, solo Tesseract: ${detail}`);
      return '';
    }
  }

  /** Comprueba conectividad (útil tras deploy en Coolify). */
  async probeOllamaReachable(): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`Ollama /api/tags → HTTP ${res.status} (${baseUrl})`);
        return false;
      }
      const data = (await res.json()) as { models?: { name?: string }[] };
      const names = (data.models ?? []).map((m) => m.name ?? '').filter(Boolean);
      const model = this.getModel();
      const hasModel = names.some(
        (n) => n === model || n.startsWith(`${model}:`),
      );
      if (!hasModel) {
        this.logger.warn(
          `Ollama alcanzable pero falta modelo "${model}". Instalados: ${names.join(', ') || '(ninguno)'}`,
        );
        return false;
      }
      this.logger.log(`Ollama OK en ${baseUrl} (modelo ${model} presente)`);
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo conectar a Ollama en ${baseUrl}: ${this.formatFetchError(err, baseUrl)}`,
      );
      return false;
    }
  }

  private resolveBaseUrl(): string {
    if (this.resolvedBaseUrl) {
      return this.resolvedBaseUrl;
    }
    const configured = (this.config.get<string>('OLLAMA_URL') ?? '').trim();
    let url = configured || this.inferDefaultOllamaUrl();
    url = url.replace(/\/$/, '');
    if (this.shouldRewriteLocalhostForDocker(url)) {
      this.logger.warn(
        `OLLAMA_URL=${url} no funciona entre contenedores; usando ${DOCKER_OLLAMA_HOST}. ` +
          'En Coolify define OLLAMA_URL=http://ollama:11434 (o el hostname interno del servicio Ollama).',
      );
      url = DOCKER_OLLAMA_HOST;
    }
    this.resolvedBaseUrl = url;
    return url;
  }

  private inferDefaultOllamaUrl(): string {
    return this.isRunningInContainer()
      ? DOCKER_OLLAMA_HOST
      : 'http://localhost:11434';
  }

  private shouldRewriteLocalhostForDocker(url: string): boolean {
    if (process.env.OLLAMA_URL_DOCKER_FIX === 'false') {
      return false;
    }
    if (!this.isRunningInContainer()) {
      return false;
    }
    return /localhost|127\.0\.0\.1/i.test(url);
  }

  private isRunningInContainer(): boolean {
    return existsSync('/.dockerenv');
  }

  private getModel(): string {
    return this.config.get<string>('OLLAMA_MODEL')?.trim() || 'glm-ocr';
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('OLLAMA_OCR_TIMEOUT_MS'));
    return Number.isFinite(n) && n > 0 ? n : 120_000;
  }

  private formatFetchError(err: unknown, baseUrl: string): string {
    if (!(err instanceof Error)) {
      return String(err);
    }
    const cause = err.cause instanceof Error ? err.cause.message : '';
    const hint = /localhost|127\.0\.0\.1/.test(baseUrl)
      ? ' (desde Docker usa http://ollama:11434, no localhost)'
      : '';
    return cause ? `${err.message} — ${cause}${hint}` : `${err.message}${hint}`;
  }

  private async callChat(base64: string, baseUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.getTimeoutMs());
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
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
        throw new Error(
          `Ollama glm-ocr no respondió a tiempo (${this.getTimeoutMs()}ms)`,
        );
      }
      throw err;
    }
  }
}
