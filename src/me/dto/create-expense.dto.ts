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

export class CreateExpenseDto extends CreateMoneyEntryCoreDto {
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

  /** Día del pago (Caracas) para tasa BCV; no define el periodo presupuestario. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;
}
