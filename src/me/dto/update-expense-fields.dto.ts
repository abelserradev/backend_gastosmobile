import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Campos editables de un gasto vía Telegram o API futura. */
export class UpdateExpenseFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsIn(['USD', 'BS'])
  amountCurrency?: 'USD' | 'BS';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;
}
