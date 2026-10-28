import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CreateMoneyEntryCoreDto } from './money-entry-core.dto';

export class CreateIncomeDto extends CreateMoneyEntryCoreDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ValidateIf((o: CreateIncomeDto) => !o.sourceId)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceName?: string;

  /** Día del ingreso para tasa BCV; no define el periodo presupuestario. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  receivedDate?: string;
}
