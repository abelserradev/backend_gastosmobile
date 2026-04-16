import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min } from 'class-validator';

export class UpdatePreferencesDto {
  @IsIn(['USD', 'BS'])
  defaultCurrency!: 'USD' | 'BS';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncome!: number;
}
