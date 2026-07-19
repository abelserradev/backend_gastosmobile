import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
  @IsString()
  @MaxLength(80)
  sourceName?: string;
}
