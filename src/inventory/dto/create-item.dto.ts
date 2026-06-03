import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO para crear un producto en inventario.
 *
 * Reglas de negocio:
 * - SKU es opcional (pequeños comercios pueden no usar códigos formales).
 * - Unidad por defecto 'pieza' pero puede ser kg, litro, caja, etc.
 * - Stock mínimo para alertas de reabastecimiento.
 * - Stock inicial crea un movimiento INITIAL automáticamente.
 */
export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit: string = 'pieza';

  @IsInt()
  @Min(0)
  minStock: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;

  /** FEAT-004: precio de catálogo / referencia para ventas (opcional). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;
}
