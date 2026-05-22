import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Copia estable de ParseInvoiceResult; no importar el DTO OCR para no acoplar módulos. */
export class InvoiceOcrSnapshotDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  merchant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(520)
  description?: string;

  @IsString()
  @MaxLength(8000)
  rawText!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsString()
  @MaxLength(16)
  currency!: string;
}

export class OcrFeedbackCorrectedDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Monto canónico en USD tal como persistió el backend tras BCV si aplica. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountUsd!: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;

  /** Moneda nominal en captura antes de convertir almacenamiento interno a USD (BCV). */
  @IsOptional()
  @IsIn(['USD', 'BS'])
  currencyCapture?: 'USD' | 'BS';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankLabel?: string;
}

export class SubmitOcrFeedbackDto {
  @IsIn(['IMAGE_UPLOAD_FLOW', 'EDIT_EXPENSE'])
  source!: 'IMAGE_UPLOAD_FLOW' | 'EDIT_EXPENSE';

  @IsOptional()
  @IsIn(['quick_confirm', 'detail_form'])
  submissionVariant?: 'quick_confirm' | 'detail_form';

  @IsOptional()
  @IsIn([
    'payment_screenshot',
    'physical_receipt',
    'fiscal_or_formal_invoice',
    'unknown',
  ])
  documentKindGuess?:
    | 'payment_screenshot'
    | 'physical_receipt'
    | 'fiscal_or_formal_invoice'
    | 'unknown';

  @ValidateNested()
  @Type(() => InvoiceOcrSnapshotDto)
  parseSnapshot!: InvoiceOcrSnapshotDto;

  @ValidateNested()
  @Type(() => OcrFeedbackCorrectedDto)
  corrected!: OcrFeedbackCorrectedDto;

  @IsOptional()
  @IsUUID()
  expenseId?: string;
}
