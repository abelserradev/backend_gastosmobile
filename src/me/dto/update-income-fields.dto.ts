import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateIncomeFieldsDto {
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
  sourceName?: string;
}
