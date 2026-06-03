import { BadRequestException } from '@nestjs/common';
import { MovementType } from './dto/create-movement.dto';

/** Tipos donde el valor monetario no aplica (FEAT-004). */
const MOVEMENT_TYPES_WITHOUT_UNIT_PRICE: ReadonlySet<MovementType> = new Set([
  MovementType.TRANSFER_OUT,
  MovementType.TRANSFER_IN,
  MovementType.ADJUSTMENT,
]);

/**
 * Decide qué unitPrice persistir según el tipo de movimiento.
 * Transferencias y ajustes ignoran precio aunque el cliente lo envíe.
 */
export function resolvePersistedUnitPrice(
  type: MovementType,
  unitPrice?: number | null,
): number | null {
  if (unitPrice === undefined || unitPrice === null) {
    return null;
  }
  if (MOVEMENT_TYPES_WITHOUT_UNIT_PRICE.has(type)) {
    return null;
  }
  validateOptionalPrice(unitPrice);
  return unitPrice;
}

export function validateOptionalPrice(price?: number | null): void {
  if (price === undefined || price === null) {
    return;
  }
  if (price < 0) {
    throw new BadRequestException('El precio no puede ser negativo');
  }
}

/** Serializa Decimal de Prisma o number a number | null para la API. */
export function parseDecimalPrice(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

/** Valor referencial de línea: |cantidad| × unitPrice (solo reportes/UI). */
export function calculateMovementLineValue(
  quantity: number,
  unitPrice: number | null | undefined,
): number | null {
  if (unitPrice === undefined || unitPrice === null) {
    return null;
  }
  return Math.abs(quantity) * unitPrice;
}
