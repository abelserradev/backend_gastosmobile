import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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

  /** FEAT-004: precio de catálogo (opcional; null para borrar). */
  @IsOptional()
  @ValidateIf((o) => o.salePrice != null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number | null;

  // No incluimos initialStock - eso solo al crear
}
