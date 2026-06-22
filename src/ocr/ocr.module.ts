import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { TesseractInvoiceEngine } from './engines/tesseract-invoice.engine';
import { OllamaGlmOcrService } from './services/ollama-glm-ocr.service';
import { GoogleVisionOcrService } from './services/google-vision-ocr.service';
import { GoogleVisionQuotaService } from './services/google-vision-quota.service';

/** OCR híbrido: Tesseract.js + Cloud Vision (default) u Ollama legacy. */
@Module({
  controllers: [OcrController],
  providers: [
    TesseractInvoiceEngine,
    GoogleVisionOcrService,
    GoogleVisionQuotaService,
    OllamaGlmOcrService,
    OcrService,
  ],
  exports: [OcrService],
})
export class OcrModule {}
