import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Modos de ciclo presupuestario soportados (FEAT-001).
 */
export enum BudgetCycleMode {
  /** Comportamiento calendario tradicional (mes natural). */
  CALENDAR_MONTH = 'calendar_month',
  /** Corte mensual configurable (día específico como fin del periodo). */
  MONTHLY_CUTOFF = 'monthly_cutoff',
}

/**
 * Configuración del ciclo presupuestario (FEAT-001).
 * Permite al usuario definir cuándo cierra su periodo de gastos.
 */
export class BudgetCycleConfig {
  /** Modo de ciclo: calendario natural o corte configurable. */
  @IsEnum(BudgetCycleMode)
  mode!: BudgetCycleMode;

  /**
   * Día del mes que CIERRA el periodo (corte).
   * - El usuario cobra este día → cierra periodo, calcula sobrante.
   * - El nuevo periodo empieza el día siguiente (tablero en blanco).
   * - Ej: corte=15 → periodo va del 16 al 15 del mes siguiente.
   *
   * Recomendado 1-28 para evitar inconsistencias (febrero no tiene 29-30-31).
   */
  @IsInt()
  @Min(1)
  @Max(28)
  cutoffDay!: number;
}

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

  /**
   * Configuración del ciclo presupuestario (FEAT-001).
   * Si no se envía, se mantienen los valores actuales o defaults.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetCycleConfig)
  budgetCycle?: BudgetCycleConfig;
}
