import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO para crear un gasto con imagen de comprobante adjunta.
 * Llega como campos de un multipart/form-data (strings que se transforman).
 * El título es opcional; si no viene, se autogenera desde merchant o tipo.
 */
export class CreateExpenseWithReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  /** 'USD' o 'BS' — indica en qué moneda viene amount. Si BS, se convierte con tasa BCV. */
  @IsOptional()
  @IsIn(['USD', 'BS'])
  amountCurrency?: 'USD' | 'BS';

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  categoryName!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;
}
