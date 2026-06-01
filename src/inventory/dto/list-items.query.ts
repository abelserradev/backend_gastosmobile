import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Query params para listar productos de inventario.
 */
export class ListInventoryItemsQuery {
  @IsOptional()
  @IsString()
  search?: string; // búsqueda por nombre o SKU

  @IsOptional()
  @IsUUID()
  branchId?: string; // Fase B: filtrar por sucursal
}

/**
 * Query params para filtrar productos con stock bajo.
 */
export class LowStockQuery {
  @IsOptional()
  @IsUUID()
  branchId?: string; // Fase B: filtrar por sucursal
}
