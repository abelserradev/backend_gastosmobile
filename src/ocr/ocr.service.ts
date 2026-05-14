import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    if (!forwardMime.toLowerCase().startsWith('image/')) {
      throw new BadRequestException(
        `Tipo de archivo no soportado: ${mimetype || 'desconocido'}. Solo se aceptan imágenes.`,
      );
    }

    // Validar tamaño (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      throw new BadRequestException(
        `Imagen demasiado grande (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB). Máximo: 10MB`,
      );
    }
    if (fileBuffer.length === 0) {
      throw new BadRequestException('El archivo de imagen está vacío');
    }

    try {
      // Construir FormData manualmente para fetch
      const boundary = `----FormBoundary${Date.now()}`;
      const formData = this.buildFormData(
        boundary,
        fileBuffer,
        filename,
        forwardMime,
      );

      const timeoutMs = this.readOcrForwardTimeoutMs();
      const abortController = new AbortController();
      const abortTimer = setTimeout(() => abortController.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(`${this.ocrServiceUrl}/parse-invoice`, {
          method: 'POST',
          body: formData,
          signal: abortController.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `OCR service responded with ${response.status}: ${errorText}`,
        );

        if (response.status === 400) {
          let detail: string | undefined;
          try {
            const parsed = JSON.parse(errorText) as { detail?: unknown };
            if (typeof parsed.detail === 'string') {
              detail = parsed.detail;
            }
          } catch {
            /* cuerpo no JSON */
          }
          throw new BadRequestException(
            detail ??
              'La imagen no parece ser una factura válida o está corrupta',
          );
        }
        throw new ServiceUnavailableException(
          'El servicio OCR no está disponible en este momento',
        );
      }

      const rawBody = (await response.json()) as Record<string, unknown>;
      const result = this.normalizeOcrServiceJson(rawBody);

      // Log de confianza para monitoreo
      this.logger.log(
        `OCR procesado: confidence=${result.confidence.toFixed(2)}, amount=${result.amount}, merchant=${result.merchant}`,
      );

      return result;
    } catch (error) {
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

      this.logger.error(`Error llamando al servicio OCR: ${error}`);
      throw new ServiceUnavailableException(
        'No se pudo contactar el servicio OCR. Verifica que esté corriendo en ' +
          this.ocrServiceUrl,
      );
    }
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
    return (
      byExt[ext] ??
      (mimetype.trim() || 'application/octet-stream')
    );
  }

  /**
   * FastAPI/Pydantic suele serializar snake_case (p. ej. raw_text). Unificamos al DTO del Nest.
   */
  private normalizeOcrServiceJson(raw: Record<string, unknown>): ParseInvoiceResultDto {
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
      merchant:
        typeof raw.merchant === 'string' ? raw.merchant : undefined,
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
      typeof v === 'number'
        ? v
        : Number.parseInt(String(v ?? '120000'), 10);
    if (!Number.isFinite(n) || n < 5000) {
      return 120_000;
    }
    return Math.min(n, 600_000);
  }

  /**
   * Construye manualmente el body multipart/form-data como Blob.
   * Compatible con Node 18+ fetch global.
   */
  private buildFormData(
    boundary: string,
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Blob {
    const crlf = '\r\n';
    const preAmble =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}` +
      `Content-Type: ${mimetype}${crlf}${crlf}`;

    const postAmble = `${crlf}--${boundary}--${crlf}`;

    // Convertir a Uint8Array para el Blob
    const parts = [
      new TextEncoder().encode(preAmble),
      new Uint8Array(buffer),
      new TextEncoder().encode(postAmble),
    ];

    // Calcular longitud total
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    return new Blob([combined], {
      type: `multipart/form-data; boundary=${boundary}`,
    });
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
