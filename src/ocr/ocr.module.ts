import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';

/**
 * Módulo OCR para procesamiento de facturas.
 * Requiere que el servicio Python esté corriendo en OCR_SERVICE_URL.
 */
@Module({
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
