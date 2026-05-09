import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min, ValidateIf } from 'class-validator';

export class UpdatePreferencesDto {
  @IsIn(['USD', 'BS'])
  defaultCurrency!: 'USD' | 'BS';

  @ValidateIf((o: UpdatePreferencesDto) => o.defaultCurrency === 'USD')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  /** Monto nominal en bolívares cuando controlás el ingreso en Bs. */
  @ValidateIf((o: UpdatePreferencesDto) => o.defaultCurrency === 'BS')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncomeBs?: number;
}
