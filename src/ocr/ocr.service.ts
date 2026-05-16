import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TesseractInvoiceEngine } from './engines/tesseract-invoice.engine';
import { buildParseInvoiceFromTesseract } from './parsing/build-invoice-result';
import { ParseInvoiceResultDto } from './dto/parse-invoice-result.dto';

/**
 * OCR de facturas integrado en Nest (Tesseract.js).
 * El front solo llama POST /api/ocr/parse-invoice; no hay servicio Python aparte.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly tesseractEngine: TesseractInvoiceEngine) {}

  async parseInvoice(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<ParseInvoiceResultDto> {
    const forwardMime = this.resolveImageMimeTypeForForward(mimetype, filename);
    this.assertImageAcceptableForForward(fileBuffer, forwardMime, mimetype);
    const tessText = await this.tesseractEngine.recognizeText(fileBuffer);
    const result = buildParseInvoiceFromTesseract(tessText);
    this.logger.log(
      `OCR procesado: confidence=${result.confidence.toFixed(2)}, amount=${result.amount}, merchant=${result.merchant}`,
    );
    return result;
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
}
