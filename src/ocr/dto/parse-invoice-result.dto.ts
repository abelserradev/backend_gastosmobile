import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

/**
 * Resultado del análisis OCR de una factura.
 */
export class ParseInvoiceResultDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  rawText: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsString()
  currency: string;
}
