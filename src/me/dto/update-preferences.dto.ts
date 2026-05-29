import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Reglas efectivas (servicio):
 * - USD: obligatorio `monthlyIncome`.
 * - BS: `monthlyIncomeBs` (cliente nuevo) o `monthlyIncome` (cliente viejo: USD congelado al guardar).
 */
export class UpdatePreferencesDto {
  @IsIn(['USD', 'BS'])
  defaultCurrency!: 'USD' | 'BS';

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncomeBs?: number;

  /** Renovación mensual con sobrante: true suma el saldo al mes entrante. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  applySurplus?: boolean;
}
