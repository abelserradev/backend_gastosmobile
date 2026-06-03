import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Tipos de movimiento de inventario (FEAT-002).
 *
 * Movimientos inmutables - no se borran, se compensan con ajustes.
 */
export enum MovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
  INITIAL = 'INITIAL',
  RETURN = 'RETURN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
}

/**
 * DTO para registrar un movimiento de stock.
 *
 * Reglas:
 * - quantity siempre positivo en DTO (se convierte a negativo para salidas según type).
 * - No se permite dejar stock negativo (validación en servicio).
 * - Los movimientos son inmutables (no se borran).
 */
export class CreateStockMovementDto {
  @IsUUID()
  itemId: string;

  @IsEnum(MovementType)
  type: MovementType;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  // Fase B: Multi-sucursal
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  targetBranchId?: string;

  // Validación: targetBranchId solo aplica para transferencias
  @ValidateIf((o) =>
    [MovementType.TRANSFER_OUT, MovementType.TRANSFER_IN].includes(o.type),
  )
  @IsUUID()
  transferMovementId?: string;

  /** FEAT-004: precio unitario del movimiento (opcional; ignorado en transferencias). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}

/**
 * DTO para ajuste de stock (cantidad puede ser positiva o negativa).
 * Caso especial de movimiento para correcciones.
 */
export class AdjustStockDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  adjustmentQty: number; // puede ser negativo (bajar) o positivo (subir)

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}
