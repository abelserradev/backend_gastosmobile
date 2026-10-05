import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { ProfileAccessService } from '../common/services/profile-access.service';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';
import { InventorySummaryResponse } from './entities/inventory-item.response';
import {
  INVENTORY_SUMMARY_TTL_MS,
  inventorySummaryCacheKey,
} from './inventory-cache.util';

/**
 * Orquestación del módulo de inventario (FEAT-002).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly profileAccess: ProfileAccessService,
    readonly itemService: InventoryItemService,
    readonly movementService: StockMovementService,
  ) {}

  /**
   * Resumen de inventario para el dashboard de un perfil comercio.
   */
  async getSummary(
    profileId: string,
    userId: string,
  ): Promise<InventorySummaryResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const cacheKey = inventorySummaryCacheKey(profileId);
    const cached = await this.cache.get<InventorySummaryResponse>(cacheKey);
    if (cached) {
      return cached;
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

    const summary: InventorySummaryResponse = {
      totalItems,
      lowStockCount: lowStockItems,
      totalStockValue: 0,
      lastMovementAt: lastMovement?.createdAt.toISOString() ?? null,
    };
    await this.cache.set(cacheKey, summary, INVENTORY_SUMMARY_TTL_MS);
    return summary;
  }

  async hasInventoryEnabled(profileId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { type: true },
    });

    return profile?.type === 'comercio';
  }
}
