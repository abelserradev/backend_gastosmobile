import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO para actualizar datos básicos de un producto.
 *
 * Restricciones:
 * - No permite modificar stock directamente (usar movimientos).
 * - SKU, nombre, unidad, minStock sí son editables.
 */
export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  // No incluimos initialStock - eso solo al crear
}
