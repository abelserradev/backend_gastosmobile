import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';
import { InventorySummaryResponse } from './entities/inventory-item.response';

/**
 * Servicio de orquestación para el módulo de inventario.
 *
 * Responsabilidades:
 * - Delegar operaciones de productos a InventoryItemService.
 * - Delegar operaciones de movimientos a StockMovementService.
 * - Proveer resúmenes y estadísticas combinadas.
 * - Punto único de entrada para casos de uso complejos.
 *
 * Nota: No duplica lógica de negocio, solo orquesta.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    readonly itemService: InventoryItemService,
    readonly movementService: StockMovementService,
  ) {}

  /**
   * Resumen de inventario para el dashboard de un perfil comercio.
   *
   * Datos retornados:
   * - Total de productos
   * - Cantidad con stock bajo
   * - Último movimiento registrado
   */
  async getSummary(
    profileId: string,
    userId: string,
  ): Promise<InventorySummaryResponse> {
    // Verificar ownership (aunque ya lo haga el guard, doble check no hace daño)
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
    });

    if (!profile) {
      return {
        totalItems: 0,
        lowStockCount: 0,
        totalStockValue: 0,
        lastMovementAt: null,
      };
    }

    const [totalItems, lowStockItems, lastMovement] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { profileId } }),

      this.prisma.inventoryItem.count({
        where: {
          profileId,
          currentStock: { lte: this.prisma.inventoryItem.fields.minStock },
        },
      }),

      this.prisma.stockMovement.findFirst({
        where: { item: { profileId } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      totalItems,
      lowStockCount: lowStockItems,
      totalStockValue: 0, // Fase C: calcular valor estimado del inventario
      lastMovementAt: lastMovement?.createdAt.toISOString() ?? null,
    };
  }

  /**
   * Verifica si un perfil tiene activado el módulo de inventario.
   *
   * Útil para mostrar/ocultar opciones en UI según el tipo de perfil.
   */
  async hasInventoryEnabled(profileId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { type: true },
    });

    return profile?.type === 'comercio';
  }
}
