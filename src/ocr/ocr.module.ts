import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { TesseractInvoiceEngine } from './engines/tesseract-invoice.engine';
import { OllamaGlmOcrService } from './services/ollama-glm-ocr.service';

/** OCR híbrido: Tesseract.js + glm-ocr (Ollama) opcional. */
@Module({
  controllers: [OcrController],
  providers: [TesseractInvoiceEngine, OllamaGlmOcrService, OcrService],
  exports: [OcrService],
})
export class OcrModule {}
