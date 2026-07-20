import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  /** Si amount viene en Bs, se convierte a USD con tasa BCV del paymentDate. */
  @IsOptional()
  @IsIn(['USD', 'BS'])
  amountCurrency?: 'USD' | 'BS';

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ValidateIf((o: CreateExpenseDto) => !o.categoryId)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  categoryName?: string;

  /** YYYY-MM-DD del primer día del mes; si omites, mes calendario actual (Caracas). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  referenceMonth?: string;

  /** Día del pago (Caracas) para fijar tasa BCV; si omites, hoy en Caracas. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;
}
