import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UpdateMoneyEntryCoreDto } from './money-entry-core.dto';

/** Campos editables de un gasto vía Telegram o API futura. */
export class UpdateExpenseFieldsDto extends UpdateMoneyEntryCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;
}
