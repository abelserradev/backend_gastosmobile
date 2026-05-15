import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import FormData from 'form-data';
import { ParseInvoiceResultDto } from './dto/parse-invoice-result.dto';

/**
 * Servicio OCR que se comunica con el servicio Python de Moondream.
 * El servicio Python corre en un puerto separado (default: 8001).
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly ocrServiceUrl: string;

  constructor(private readonly config: ConfigService) {
    this.ocrServiceUrl =
      this.config.get<string>('OCR_SERVICE_URL') ?? 'http://localhost:8001';
    this.logger.log(`OCR Service URL: ${this.ocrServiceUrl}`);
  }

  /**
   * Envía una imagen al servicio OCR para extraer datos de factura.
   * @param fileBuffer Buffer de la imagen
   * @param filename Nombre original del archivo
   * @param mimetype MIME type de la imagen
   * @returns Datos extraídos de la factura
   */
  async parseInvoice(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<ParseInvoiceResultDto> {
    const forwardMime = this.resolveImageMimeTypeForForward(mimetype, filename);
    this.assertImageAcceptableForForward(fileBuffer, forwardMime, mimetype);
    try {
      // form-data + axios: límites/headers de multipart que Undici a veces no cuadra con proxies (p. ej. Cloudflare).
      const rawBody = await this.forwardInvoiceMultipartWithAxios(
        fileBuffer,
        filename,
        forwardMime,
      );
      const result = this.normalizeOcrServiceJson(rawBody);
      this.logger.log(
        `OCR procesado: confidence=${result.confidence.toFixed(2)}, amount=${result.amount}, merchant=${result.merchant}`,
      );
      return result;
    } catch (error) {
      this.rethrowScanInvoiceFailure(error);
    }
  }

  private assertImageAcceptableForForward(
    fileBuffer: Buffer,
    forwardMime: string,
    declaredMimetype: string,
  ): void {
    if (!forwardMime.toLowerCase().startsWith('image/')) {
      throw new BadRequestException(
        `Tipo de archivo no soportado: ${declaredMimetype || 'desconocido'}. Solo se aceptan imágenes.`,
      );
    }
    const maxBytes = 10 * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new BadRequestException(
        `Imagen demasiado grande (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB). Máximo: 10MB`,
      );
    }
    if (fileBuffer.length === 0) {
      throw new BadRequestException(
        'El archivo de imagen está vacío (0 bytes).',
      );
    }
  }

  private async forwardInvoiceMultipartWithAxios(
    fileBuffer: Buffer,
    filename: string,
    forwardMime: string,
  ): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: this.sanitizeFilenameForMultipart(filename),
      contentType: forwardMime,
    });
    const base = this.ocrServiceUrl.replace(/\/$/, '');
    const url = `${base}/parse-invoice`;
    const timeoutMs = this.readOcrForwardTimeoutMs();
    const response = await axios.post<unknown>(url, form, {
      headers: form.getHeaders(),
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      this.throwMatchingOcrHttpException(response.status, response.data);
    }
    const data = response.data;
    if (typeof data !== 'object' || data === null) {
      throw new ServiceUnavailableException(
        'El servicio OCR devolvió un cuerpo inesperado',
      );
    }
    return data as Record<string, unknown>;
  }

  private throwMatchingOcrHttpException(
    status: number,
    payload: unknown,
  ): never {
    const errorText = this.stringifyOcrErrorPayload(payload);
    this.logger.warn(`OCR service responded with ${status}: ${errorText}`);
    if (status === 400) {
      const detailFromFastApi = this.tryExtractFastApiDetail(payload);
      throw new BadRequestException(
        detailFromFastApi ??
          'La imagen no parece ser una factura válida o está corrupta',
      );
    }
    throw new ServiceUnavailableException(
      'El servicio OCR no está disponible en este momento',
    );
  }

  private stringifyOcrErrorPayload(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }
    try {
      return JSON.stringify(data);
    } catch {
      return '(no serializable)';
    }
  }

  private tryExtractFastApiDetail(payload: unknown): string | undefined {
    if (typeof payload === 'object' && payload !== null) {
      const d = (payload as { detail?: unknown }).detail;
      if (typeof d === 'string') {
        return d;
      }
    }
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload) as { detail?: unknown };
        if (typeof parsed.detail === 'string') {
          return parsed.detail;
        }
      } catch {
        /* cuerpo no JSON */
      }
    }
    return undefined;
  }

  private formatUnknownErrorForLog(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return '(valor no Error ni string; revisar causa)';
  }

  private rethrowScanInvoiceFailure(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.error(
        `Timeout llamando al OCR (${this.readOcrForwardTimeoutMs()} ms): ${this.ocrServiceUrl}`,
      );
      throw new ServiceUnavailableException(
        'El servicio OCR tardó demasiado en responder. Intenta de nuevo o sube una imagen más pequeña.',
      );
    }
    if (isAxiosError(error)) {
      const msg = (error.message ?? '').toLowerCase();
      const timedOut = error.code === 'ECONNABORTED' || msg.includes('timeout');
      if (timedOut) {
        this.logger.error(
          `Timeout llamando al OCR (${this.readOcrForwardTimeoutMs()} ms): ${this.ocrServiceUrl}`,
        );
        throw new ServiceUnavailableException(
          'El servicio OCR tardó demasiado en responder. Intenta de nuevo o sube una imagen más pequeña.',
        );
      }
    }
    const errMsg = this.formatUnknownErrorForLog(error);
    this.logger.error(`Error llamando al servicio OCR: ${errMsg}`);
    throw new ServiceUnavailableException(
      'No se pudo contactar el servicio OCR. Verifica que esté corriendo en ' +
        this.ocrServiceUrl,
    );
  }

  /**
   * Varias cámaras/navegadores envían application/octet-stream o MIME vacío; al reenviar a Python
   * hay que poner un image/* coherente con la extensión para que Starlette reciba Content-Type válido.
   */
  private resolveImageMimeTypeForForward(
    mimetype: string,
    filename: string,
  ): string {
    const mt = (mimetype ?? '').trim().toLowerCase();
    if (mt.startsWith('image/')) {
      return mt === 'image/jpg' ? 'image/jpeg' : mt;
    }
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const byExt: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heic',
      gif: 'image/gif',
    };
    return byExt[ext] ?? (mimetype.trim() || 'application/octet-stream');
  }

  /**
   * FastAPI/Pydantic suele serializar snake_case (p. ej. raw_text). Unificamos al DTO del Nest.
   */
  private normalizeOcrServiceJson(
    raw: Record<string, unknown>,
  ): ParseInvoiceResultDto {
    const rawTextCandidate = raw.rawText ?? raw.raw_text;
    const rawText =
      typeof rawTextCandidate === 'string' ? rawTextCandidate : '';
    const confidenceVal = raw.confidence;
    const confidence =
      typeof confidenceVal === 'number' && Number.isFinite(confidenceVal)
        ? confidenceVal
        : 0;
    const currencyVal = raw.currency;
    const currency =
      typeof currencyVal === 'string' && currencyVal.length > 0
        ? currencyVal
        : 'USD';
    const amountVal = raw.amount;
    const amount =
      typeof amountVal === 'number' && Number.isFinite(amountVal)
        ? amountVal
        : undefined;
    return {
      amount,
      date: typeof raw.date === 'string' ? raw.date : undefined,
      merchant: typeof raw.merchant === 'string' ? raw.merchant : undefined,
      description:
        typeof raw.description === 'string' ? raw.description : undefined,
      rawText,
      confidence,
      currency,
    };
  }

  private readOcrForwardTimeoutMs(): number {
    const v = this.config.get<string | number>('OCR_FORWARD_TIMEOUT_MS');
    const n =
      typeof v === 'number' ? v : Number.parseInt(String(v ?? '120000'), 10);
    if (!Number.isFinite(n) || n < 5000) {
      return 120_000;
    }
    return Math.min(n, 600_000);
  }

  /**
   * Evita romper Content-Disposition si el nombre trae comillas o saltos (casos raros de clientes).
   */
  private sanitizeFilenameForMultipart(original: string): string {
    const leaf =
      (original ?? 'upload').split(/[/\\]/).pop()?.trim() || 'upload';
    const cleaned = leaf.replace(/[\r\n"]/g, '_');
    const clipped = cleaned.slice(0, 200);
    return clipped.length > 0 ? clipped : 'upload';
  }

  /**
   * Health check del servicio OCR.
   * @returns true si el servicio responde OK
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.ocrServiceUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}
