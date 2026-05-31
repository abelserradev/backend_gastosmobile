import { PartialType } from '@nestjs/mapped-types';
import { CreateInventoryItemDto } from './create-item.dto';

/**
 * DTO para actualizar datos básicos de un producto.
 *
 * Restricciones:
 * - No permite modificar stock directamente (usar movimientos).
 * - SKU, nombre, unidad, minStock sí son editables.
 */
export class UpdateInventoryItemDto extends PartialType(CreateInventoryItemDto) {
  // Hereda todas las propiedades opcionales del create
  // La lógica de negocio valida que no se modifique currentStock por este endpoint
}
