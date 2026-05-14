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
    // Validar tipo
    if (!mimetype.startsWith('image/')) {
      throw new BadRequestException(
        `Tipo de archivo no soportado: ${mimetype}. Solo se aceptan imágenes.`,
      );
    }

    // Validar tamaño (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      throw new BadRequestException(
        `Imagen demasiado grande (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB). Máximo: 10MB`,
      );
    }

    try {
      // Construir FormData manualmente para fetch
      const boundary = `----FormBoundary${Date.now()}`;
      const formData = this.buildFormData(
        boundary,
        fileBuffer,
        filename,
        mimetype,
      );

      const response = await fetch(`${this.ocrServiceUrl}/parse-invoice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `OCR service responded with ${response.status}: ${errorText}`,
        );

        if (response.status === 400) {
          throw new BadRequestException(
            'La imagen no parece ser una factura válida o está corrupta',
          );
        }
        throw new ServiceUnavailableException(
          'El servicio OCR no está disponible en este momento',
        );
      }

      const result = (await response.json()) as ParseInvoiceResultDto;

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

      this.logger.error(`Error llamando al servicio OCR: ${error}`);
      throw new ServiceUnavailableException(
        'No se pudo contactar el servicio OCR. Verifica que esté corriendo en ' +
          this.ocrServiceUrl,
      );
    }
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
