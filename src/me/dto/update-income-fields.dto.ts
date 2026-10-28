import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UpdateMoneyEntryCoreDto } from './money-entry-core.dto';

/** Campos editables de un ingreso vía Telegram o API futura. */
export class UpdateIncomeFieldsDto extends UpdateMoneyEntryCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceName?: string;
}
