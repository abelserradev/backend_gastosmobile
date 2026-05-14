import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { ParseInvoiceResultDto } from './dto/parse-invoice-result.dto';

/**
 * Controlador para endpoints de OCR.
 * Permite subir imágenes de facturas y obtener datos estructurados.
 */
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  /**
   * POST /ocr/parse-invoice
   * Recibe una imagen de factura y retorna datos extraídos.
   */
  @Post('parse-invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException(
              'Solo se aceptan archivos de imagen (jpg, png, webp)',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async parseInvoice(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ParseInvoiceResultDto> {
    if (!file) {
      throw new BadRequestException('No se subió ninguna imagen');
    }

    return this.ocrService.parseInvoice(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }
}
