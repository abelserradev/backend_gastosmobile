import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAccessService } from '../common/services/profile-access.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';
import {
  InventoryItemResponse,
  StockBalanceResponse,
} from './entities/inventory-item.response';
import { MovementType } from './dto/create-movement.dto';
import { mapInventoryItemToResponse } from './inventory.mappers';
import { validateOptionalPrice } from './inventory-pricing.util';

/**
 * Servicio para gestión de productos en inventario.
 *
 * Responsabilidades (SRP):
 * - CRUD de productos (InventoryItem).
 * - Validar reglas de negocio: SKU único por perfil, no eliminar si hay movimientos.
 * - No gestiona movimientos (eso es StockMovementService).
 *
 * Reglas de negocio:
 * 1. Solo perfiles tipo 'comercio' pueden tener inventario.
 * 2. SKU es único por perfil (si existe).
 * 3. No se elimina producto con stock > 0 o con movimientos (integridad histórica).
 * 4. Stock actual se denormaliza vía trigger/transaction al crear movimientos.
 */
@Injectable()
export class InventoryItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileAccess: ProfileAccessService,
  ) {}

  /**
   * Lista todos los productos de un perfil con stock actual.
   */
  async listItems(
    profileId: string,
    userId: string,
    search?: string,
  ): Promise<InventoryItemResponse[]> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        profileId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });

    return items.map(mapInventoryItemToResponse);
  }

  /**
   * Obtiene un producto específico por ID.
   */
  async getItem(
    profileId: string,
    itemId: string,
    userId: string,
  ): Promise<InventoryItemResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, profileId },
    });

    if (!item) {
      throw new NotFoundException('Producto no encontrado');
    }

    return mapInventoryItemToResponse(item);
  }

  /**
   * Crea un nuevo producto con stock inicial opcional.
   *
   * Si se proporciona initialStock, crea un movimiento INITIAL.
   */
  async createItem(
    profileId: string,
    userId: string,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItemResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    // Validar SKU único por perfil si se proporciona
    if (dto.sku) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { profileId_sku: { profileId, sku: dto.sku } },
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe un producto con SKU '${dto.sku}' en este perfil`,
        );
      }
    }

    validateOptionalPrice(dto.salePrice);

    // Crear producto y movimiento inicial en transacción
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          profileId,
          name: dto.name,
          sku: dto.sku ?? null,
          unit: dto.unit,
          minStock: dto.minStock,
          currentStock: dto.initialStock ?? 0,
          salePrice: dto.salePrice ?? null,
        },
      });

      // Crear movimiento INITIAL si hay stock inicial
      if (dto.initialStock && dto.initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            type: MovementType.INITIAL,
            quantity: dto.initialStock,
            reason: 'Stock inicial al crear producto',
          },
        });
      }

      return item;
    });

    return mapInventoryItemToResponse(result);
  }

  /**
   * Actualiza datos básicos del producto (sin modificar stock).
   *
   * No permite cambiar currentStock directamente - usar movimientos.
   */
  async updateItem(
    profileId: string,
    itemId: string,
    userId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, profileId },
    });

    if (!item) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Validar SKU único si se está cambiando
    if (dto.sku && dto.sku !== item.sku) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { profileId_sku: { profileId, sku: dto.sku } },
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe un producto con SKU '${dto.sku}' en este perfil`,
        );
      }
    }

    if (dto.salePrice !== undefined) {
      validateOptionalPrice(dto.salePrice);
    }

    const updateData = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.minStock !== undefined && { minStock: dto.minStock }),
      ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
    };

    const updated = await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return mapInventoryItemToResponse(updated);
  }

  /**
   * Elimina un producto solo si no tiene movimientos ni stock.
   *
   * Regla de negocio: movimientos son inmutables (historial),
   * por tanto no se puede borrar un producto con movimientos.
   */
  async deleteItem(
    profileId: string,
    itemId: string,
    userId: string,
  ): Promise<void> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, profileId },
      include: { movements: { take: 1 } },
    });

    if (!item) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Validar que no tenga movimientos
    if (item.movements.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar un producto con movimientos de stock. ' +
          'Para descontinuar, ajuste el stock a 0 y modifique el nombre.',
      );
    }

    // Validar que no tenga stock
    if (item.currentStock > 0) {
      throw new BadRequestException(
        'No se puede eliminar un producto con stock > 0. ' +
          'Registre una salida para vaciar el stock primero.',
      );
    }

    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
  }

  /**
   * Lista productos con stock bajo (<= minStock).
   */
  async listLowStock(
    profileId: string,
    userId: string,
  ): Promise<InventoryItemResponse[]> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        profileId,
        currentStock: { lte: this.prisma.inventoryItem.fields.minStock },
      },
      orderBy: { currentStock: 'asc' },
    });

    return items.map(mapInventoryItemToResponse);
  }

  /**
   * Stock por sucursal de un producto (Fase B).
   */
  async listItemBalances(
    profileId: string,
    itemId: string,
    userId: string,
  ): Promise<StockBalanceResponse[]> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);
    await this.assertItemBelongsToProfile(itemId, profileId);

    const balances = await this.prisma.stockBalance.findMany({
      where: { itemId },
      include: { branch: { select: { name: true } } },
      orderBy: { branch: { name: 'asc' } },
    });

    return balances.map((b) => ({
      branchId: b.branchId,
      branchName: b.branch.name,
      quantity: b.quantity,
      updatedAt: b.updatedAt.toISOString(),
    }));
  }

  private async assertItemBelongsToProfile(
    itemId: string,
    profileId: string,
  ): Promise<void> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, profileId },
    });

    if (!item) {
      throw new NotFoundException('Producto no encontrado en este perfil');
    }
  }
}
