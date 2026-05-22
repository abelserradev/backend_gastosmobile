import { existsSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
/** Transcripción de facturas vía [glm-ocr](https://ollama.com/library/glm-ocr) en Ollama. */
const DEFAULT_RECEIPT_PROMPT = `Text Recognition: Copia exactamente el texto impreso del comprobante en la imagen (ticket o factura).

Reglas:
— Una línea en papel = una línea en tu respuesta.
— Escribe sólo lo que lees (nombres, RIF, fechas, montos, TOTAL).
— No describas la imagen. No inventes líneas.
— Si una línea es ilegible, pon: [ilegible]`;

/** PNG 1×1 para precarga del modelo en arranque (evita pagar ~10s+ en la 1ª factura del usuario). */
const WARMUP_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DOCKER_OLLAMA_HOST = 'http://ollama:11434';
/** En CPU sin GPU la inferencia vision suele superar 2 min; 120s cortaba la conexión antes de terminar. */
const DEFAULT_INFERENCE_TIMEOUT_MS = 300_000;
const DEFAULT_WARMUP_TIMEOUT_MS = 600_000;

@Injectable()
export class OllamaGlmOcrService implements OnModuleInit {
  private readonly logger = new Logger(OllamaGlmOcrService.name);
  private resolvedBaseUrl = '';
  /** Nombre exacto en Ollama tras resolver tags (p. ej. glm-ocr:latest si falta q8_0). */
  private resolvedModel = '';
  private modelWarmed = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.resolvedBaseUrl = this.resolveBaseUrl();
    if (!this.isEnabled()) {
      this.logger.log('OCR glm-ocr deshabilitado (OLLAMA_OCR_ENABLED)');
      return;
    }
    this.logger.log(
      `OCR glm-ocr: modelo=${this.getConfiguredModel()}, url=${this.resolvedBaseUrl}, timeout=${this.getTimeoutMs()}ms`,
    );
    void this.probeAndWarmup();
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
    await this.ensureModelResolved(baseUrl);
    const t0 = Date.now();
    try {
      const raw = await this.callChat(base64, baseUrl, this.getTimeoutMs());
      const trimmed = (raw ?? '').trim();
      this.logger.log(
        `glm-ocr: ${trimmed.length} caracteres en ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return trimmed;
    } catch (err) {
      const detail = this.formatFetchError(err, baseUrl);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      this.logger.warn(
        `glm-ocr no disponible tras ${secs}s, solo Tesseract: ${detail}`,
      );
      return '';
    }
  }

  private async probeAndWarmup(): Promise<void> {
    const ok = await this.probeOllamaReachable();
    if (!ok || !this.isWarmupEnabled()) {
      return;
    }
    void this.warmupModelInBackground();
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
      const names = (data.models ?? [])
        .map((m) => m.name ?? '')
        .filter(Boolean);
      const requested = this.getConfiguredModel();
      const resolved = this.resolveInstalledModel(requested, names);
      if (!resolved) {
        this.logger.warn(
          `Ollama alcanzable pero falta modelo "${requested}". Instalados: ${names.join(', ') || '(ninguno)'}. ` +
            `Ejecuta: ollama pull ${requested} — o define OLLAMA_MODEL=glm-ocr:latest`,
        );
        return false;
      }
      this.resolvedModel = resolved;
      if (resolved !== requested) {
        this.logger.warn(
          `Modelo "${requested}" no instalado; usando "${resolved}" (instalados: ${names.join(', ')})`,
        );
      }
      this.logger.log(`Ollama OK en ${baseUrl} (modelo ${resolved})`);
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo conectar a Ollama en ${baseUrl}: ${this.formatFetchError(err, baseUrl)}`,
      );
      return false;
    }
  }

  private async ensureModelResolved(baseUrl: string): Promise<void> {
    if (this.resolvedModel) {
      return;
    }
    const names = await this.fetchInstalledModelNames(baseUrl);
    const requested = this.getConfiguredModel();
    const resolved = this.resolveInstalledModel(requested, names);
    if (!resolved) {
      return;
    }
    this.resolvedModel = resolved;
    if (resolved !== requested) {
      this.logger.warn(
        `Modelo "${requested}" no instalado; usando "${resolved}" para inferencia`,
      );
    }
  }

  private async warmupModelInBackground(): Promise<void> {
    if (this.modelWarmed) {
      return;
    }
    const baseUrl = this.resolveBaseUrl();
    this.logger.log(
      'Precarga glm-ocr en segundo plano (1ª inferencia en CPU puede tardar varios minutos)…',
    );
    const t0 = Date.now();
    try {
      await this.callChat(
        WARMUP_IMAGE_BASE64,
        baseUrl,
        this.getWarmupTimeoutMs(),
        'Text Recognition: warmup',
      );
      this.modelWarmed = true;
      this.logger.log(
        `glm-ocr precargado en ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      this.logger.warn(
        `Precarga glm-ocr falló (la 1ª factura puede ser más lenta): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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

  private isWarmupEnabled(): boolean {
    const flag = (this.config.get<string>('OLLAMA_OCR_WARMUP') ?? 'true')
      .trim()
      .toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'off';
  }

  private getConfiguredModel(): string {
    return this.config.get<string>('OLLAMA_MODEL')?.trim() || 'glm-ocr';
  }

  /** Nombre que Ollama espera en /api/chat (resuelto contra /api/tags). */
  private getModelForRequest(): string {
    return this.resolvedModel || this.getConfiguredModel();
  }

  private async fetchInstalledModelNames(baseUrl: string): Promise<string[]> {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    return (data.models ?? []).map((m) => m.name ?? '').filter(Boolean);
  }

  /**
   * Ollama guarda variantes con tag (glm-ocr:latest, glm-ocr:q8_0).
   * Si el tag pedido no existe, usa otra variante de la misma familia.
   */
  resolveInstalledModel(requested: string, installed: string[]): string | null {
    if (installed.includes(requested)) {
      return requested;
    }
    const base = requested.includes(':')
      ? requested.slice(0, requested.indexOf(':'))
      : requested;
    const family = installed.filter(
      (n) => n === base || n.startsWith(`${base}:`),
    );
    if (family.length === 0) {
      return null;
    }
    const rank = (name: string): number => {
      if (name === requested) return 0;
      if (name === base) return 1;
      if (name === `${base}:latest`) return 2;
      if (name === `${base}:q8_0`) return 3;
      return 10;
    };
    family.sort((a, b) => rank(a) - rank(b));
    return family[0] ?? null;
  }

  private getKeepAlive(): string {
    return this.config.get<string>('OLLAMA_KEEP_ALIVE')?.trim() || '15m';
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('OLLAMA_OCR_TIMEOUT_MS'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INFERENCE_TIMEOUT_MS;
  }

  private getWarmupTimeoutMs(): number {
    const n = Number(this.config.get<string>('OLLAMA_OCR_WARMUP_TIMEOUT_MS'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WARMUP_TIMEOUT_MS;
  }

  private formatFetchError(err: unknown, baseUrl: string): string {
    if (!(err instanceof Error)) {
      return String(err);
    }
    const cause = err.cause instanceof Error ? err.cause.message : '';
    const cpuHint =
      ' En servidor solo-CPU puede necesitar OLLAMA_OCR_TIMEOUT_MS≥300000 o GPU.';
    const hint = /localhost|127\.0\.0\.1/.test(baseUrl)
      ? ' (desde Docker usa http://ollama:11434, no localhost)'
      : cpuHint;
    return cause ? `${err.message} — ${cause}${hint}` : `${err.message}${hint}`;
  }

  private async callChat(
    base64: string,
    baseUrl: string,
    timeoutMs: number,
    prompt: string = DEFAULT_RECEIPT_PROMPT,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getModelForRequest(),
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [base64],
            },
          ],
          stream: false,
          keep_alive: this.getKeepAlive(),
          options: {
            num_predict: 2048,
            temperature: 0.1,
          },
        }),
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        message?: { content?: string };
      };
      return (data?.message?.content ?? '').trim();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Ollama glm-ocr no respondió a tiempo (${timeoutMs}ms; revisa CPU/GPU y OLLAMA_OCR_TIMEOUT_MS)`,
          { cause: err },
        );
      }
      throw err;
    }
  }
}
