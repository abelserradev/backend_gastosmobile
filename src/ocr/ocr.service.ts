import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TesseractInvoiceEngine } from './engines/tesseract-invoice.engine';
import { buildParseInvoiceHybrid } from './parsing/build-invoice-result-hybrid';
import { buildParseInvoiceFromTesseract } from './parsing/build-invoice-result';
import { ParseInvoiceResultDto } from './dto/parse-invoice-result.dto';
import { OllamaGlmOcrService } from './services/ollama-glm-ocr.service';
import { GoogleVisionOcrService } from './services/google-vision-ocr.service';
import { GoogleVisionQuotaService } from './services/google-vision-quota.service';

/**
 * OCR híbrido: Tesseract.js (local) + Cloud Vision (por defecto) u Ollama legacy.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly tesseractEngine: TesseractInvoiceEngine,
    private readonly googleVision: GoogleVisionOcrService,
    private readonly visionQuota: GoogleVisionQuotaService,
    private readonly ollamaGlm: OllamaGlmOcrService,
  ) {}

  async parseInvoice(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<ParseInvoiceResultDto> {
    const forwardMime = this.resolveImageMimeTypeForForward(mimetype, filename);
    this.assertImageAcceptableForForward(fileBuffer, forwardMime, mimetype);
    let result: ParseInvoiceResultDto;
    if (this.googleVision.isEnabled()) {
      if (await this.visionQuota.canConsume()) {
        await this.visionQuota.consume();
        const [tessText, cloudText] = await Promise.all([
          this.tesseractEngine.recognizeText(fileBuffer),
          this.googleVision.transcribeReceipt(fileBuffer),
        ]);
        result = buildParseInvoiceHybrid(tessText, cloudText);
        this.logger.log(
          `OCR híbrido Vision: tess=${tessText.length} chars, cloud=${cloudText.length} chars, confidence=${result.confidence.toFixed(2)}`,
        );
      } else {
        this.visionQuota.logQuotaExhausted();
        const tessText = await this.tesseractEngine.recognizeText(fileBuffer);
        result = buildParseInvoiceFromTesseract(tessText);
        this.logger.log(
          `OCR Tesseract (cuota Vision agotada): confidence=${result.confidence.toFixed(2)}, amount=${result.amount}`,
        );
      }
    } else if (this.ollamaGlm.isEnabled()) {
      const [tessText, glmText] = await Promise.all([
        this.tesseractEngine.recognizeText(fileBuffer),
        this.ollamaGlm.transcribeReceipt(fileBuffer),
      ]);
      result = buildParseInvoiceHybrid(tessText, glmText);
      this.logger.log(
        `OCR híbrido Ollama: tess=${tessText.length} chars, glm=${glmText.length} chars, confidence=${result.confidence.toFixed(2)}`,
      );
    } else {
      const tessText = await this.tesseractEngine.recognizeText(fileBuffer);
      result = buildParseInvoiceFromTesseract(tessText);
      this.logger.log(
        `OCR Tesseract: confidence=${result.confidence.toFixed(2)}, amount=${result.amount}`,
      );
    }
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
