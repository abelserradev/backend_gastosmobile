import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { TesseractInvoiceEngine } from './engines/tesseract-invoice.engine';

/** OCR de facturas en proceso (Tesseract.js); sin contenedor Python. */
@Module({
  controllers: [OcrController],
  providers: [TesseractInvoiceEngine, OcrService],
  exports: [OcrService],
})
export class OcrModule {}
