import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * OCR en la nube vía Cloud Vision; reutiliza la cuenta de servicio de Firebase
 * para no duplicar secretos en Coolify.
 */
@Injectable()
export class GoogleVisionOcrService {
  private readonly logger = new Logger(GoogleVisionOcrService.name);
  private client: ImageAnnotatorClient | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = (this.config.get<string>('GOOGLE_VISION_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') {
      return false;
    }
    return this.parseServiceAccount() !== null;
  }

  /**
   * Extrae texto de ticket/factura; cadena vacía si falla (Tesseract sigue solo).
   */
  async transcribeReceipt(imageBuffer: Buffer): Promise<string> {
    if (!this.isEnabled()) {
      return '';
    }
    const client = this.getClient();
    if (!client) {
      return '';
    }
    const timeoutMs = this.getTimeoutMs();
    const t0 = Date.now();
    try {
      const text = await this.withTimeout(
        this.detectDocumentText(client, imageBuffer),
        timeoutMs,
      );
      const trimmed = (text ?? '').trim();
      this.logger.log(
        `Vision OCR: ${trimmed.length} caracteres en ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return trimmed;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Vision OCR no disponible tras ${((Date.now() - t0) / 1000).toFixed(1)}s, solo Tesseract: ${detail}`,
      );
      return '';
    }
  }

  private getClient(): ImageAnnotatorClient | null {
    if (this.client) {
      return this.client;
    }
    const sa = this.parseServiceAccount();
    if (!sa?.project_id || !sa.client_email || !sa.private_key) {
      return null;
    }
    this.client = new ImageAnnotatorClient({
      projectId: sa.project_id,
      credentials: {
        client_email: sa.client_email,
        private_key: sa.private_key,
      },
    });
    return this.client;
  }

  private parseServiceAccount(): ServiceAccountJson | null {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as ServiceAccountJson;
      if (!parsed.project_id?.trim()) {
        return null;
      }
      return parsed;
    } catch {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON inválido; Vision OCR deshabilitado',
      );
      return null;
    }
  }

  private async detectDocumentText(
    client: ImageAnnotatorClient,
    imageBuffer: Buffer,
  ): Promise<string> {
    const [result] = await client.annotateImage({
      image: { content: imageBuffer },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['es'] },
    });
    if (result.error?.message) {
      throw new Error(result.error.message);
    }
    return result.fullTextAnnotation?.text ?? '';
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('GOOGLE_VISION_TIMEOUT_MS'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Vision OCR no respondió a tiempo (${timeoutMs}ms; revisa GOOGLE_VISION_TIMEOUT_MS)`,
          ),
        );
      }, timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
