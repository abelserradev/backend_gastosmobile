import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createWorker, PSM, type Worker } from 'tesseract.js';

/**
 * OCR local vía Tesseract.js (WASM); complementado por glm-ocr en Ollama si está configurado.
 * Un worker reutilizado evita descargar modelos en cada foto del usuario.
 */
@Injectable()
export class TesseractInvoiceEngine {
  private readonly logger = new Logger(TesseractInvoiceEngine.name);
  private workerPromise: Promise<Worker> | null = null;

  async recognizeText(imageBuffer: Buffer): Promise<string> {
    const worker = await this.getWorker();
    try {
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      const trimmed = (text ?? '').trim();
      this.logger.log(`Tesseract: ${trimmed.length} caracteres`);
      return trimmed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tesseract falló: ${msg}`);
      throw new ServiceUnavailableException(
        'No se pudo leer la imagen. Intenta con otra foto más nítida.',
      );
    }
  }

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = this.bootstrapWorker();
    }
    return this.workerPromise;
  }

  private async bootstrapWorker(): Promise<Worker> {
    // spa+eng: tickets venezolanos mezclan español con marcas USD
    const worker = await createWorker('spa+eng', 1, {
      logger: () => {},
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    this.logger.log('Worker Tesseract listo (spa+eng)');
    return worker;
  }
}
