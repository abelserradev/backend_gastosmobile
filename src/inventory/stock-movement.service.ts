import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustStockDto,
  CreateStockMovementDto,
  MovementType,
} from './dto/create-movement.dto';
import { StockMovementResponse } from './entities/inventory-item.response';

/**
 * Servicio para gestión de movimientos de stock.
 *
 * Responsabilidades (SRP):
 * - Registrar entradas, salidas, ajustes y transferencias.
 * - Validar que no se deje stock negativo.
 * - Actualizar currentStock denormalizado en transacción.
 * - Gestionar transferencias entre sucursales (Fase B).
 *
 * Reglas de negocio clave:
 * 1. Movimientos son INMUTABLES - no se borran, se compensan con ajustes.
 * 2. Stock nunca puede quedar negativo (validación preventiva).
 * 3. Cantidades: positivas entrada, negativas salida en BD; DTO usa positivo.
 * 4. Transferencias crean par de movimientos vinculados.
 */
@Injectable()
export class StockMovementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista movimientos de un producto específico.
   */
  async listMovements(
    profileId: string,
    itemId: string,
    userId: string,
    branchId?: string,
  ): Promise<StockMovementResponse[]> {
    await this.verifyProfileOwnership(profileId, userId);
    await this.verifyItemBelongsToProfile(itemId, profileId);

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        itemId,
        ...(branchId && { branchId }),
      },
      include: {
        item: { select: { name: true } },
        branch: { select: { name: true } },
        targetBranch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      itemName: m.item.name,
      type: m.type as MovementType,
      quantity: m.quantity,
      displayQuantity: m.quantity > 0 ? `+${m.quantity}` : `${m.quantity}`,
      reason: m.reason,
      branchId: m.branchId,
      branchName: m.branch?.name ?? null,
      targetBranchId: m.targetBranchId,
      targetBranchName: m.targetBranch?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Registra un movimiento de stock con validaciones.
   *
   * Flujo:
   * 1. Validar perfil y producto.
   * 2. Calcular cantidad con signo según tipo.
   * 3. Verificar que no quede stock negativo.
   * 4. Crear movimiento y actualizar stock en transacción.
   */
  async createMovement(
    profileId: string,
    userId: string,
    dto: CreateStockMovementDto,
  ): Promise<StockMovementResponse> {
    await this.verifyProfileOwnership(profileId, userId);
    await this.verifyItemBelongsToProfile(dto.itemId, profileId);

    // Calcular cantidad con signo según tipo de movimiento
    const signedQuantity = this.calculateSignedQuantity(dto.type, dto.quantity);

    // Validar no negativo antes de crear
    await this.validateNoNegativeStock(dto.itemId, signedQuantity, dto.branchId);

    // Crear movimiento y actualizar stock en transacción
    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: dto.type,
          quantity: signedQuantity,
          reason: dto.reason ?? null,
          branchId: dto.branchId ?? null,
          targetBranchId: dto.targetBranchId ?? null,
        },
        include: {
          item: { select: { name: true } },
          branch: { select: { name: true } },
          targetBranch: { select: { name: true } },
        },
      });

      // Actualizar stock denormalizado
      await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: {
          currentStock: { increment: signedQuantity },
        },
      });

      // Fase B: Si hay branchId, actualizar StockBalance
      if (dto.branchId) {
        await this.upsertStockBalance(tx, dto.itemId, dto.branchId, signedQuantity);
      }

      return movement;
    });

    return {
      id: result.id,
      itemId: result.itemId,
      itemName: result.item.name,
      type: result.type as MovementType,
      quantity: result.quantity,
      displayQuantity:
        result.quantity > 0 ? `+${result.quantity}` : `${result.quantity}`,
      reason: result.reason,
      branchId: result.branchId,
      branchName: result.branch?.name ?? null,
      targetBranchId: result.targetBranchId,
      targetBranchName: result.targetBranch?.name ?? null,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Ajuste de stock (cantidad puede ser positiva o negativa).
   * Caso especial para correcciones de inventario físico.
   */
  async adjustStock(
    profileId: string,
    userId: string,
    dto: AdjustStockDto,
  ): Promise<StockMovementResponse> {
    await this.verifyProfileOwnership(profileId, userId);
    await this.verifyItemBelongsToProfile(dto.itemId, profileId);

    // Validar que no quede negativo si es bajada
    if (dto.adjustmentQty < 0) {
      await this.validateNoNegativeStock(
        dto.itemId,
        dto.adjustmentQty,
        undefined,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: MovementType.ADJUSTMENT,
          quantity: dto.adjustmentQty,
          reason: dto.reason,
        },
        include: {
          item: { select: { name: true } },
        },
      });

      await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: {
          currentStock: { increment: dto.adjustmentQty },
        },
      });

      return movement;
    });

    return {
      id: result.id,
      itemId: result.itemId,
      itemName: result.item.name,
      type: MovementType.ADJUSTMENT,
      quantity: result.quantity,
      displayQuantity:
        result.quantity > 0 ? `+${result.quantity}` : `${result.quantity}`,
      reason: result.reason,
      branchId: null,
      branchName: null,
      targetBranchId: null,
      targetBranchName: null,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Transferencia entre sucursales (Fase B).
   *
   * Crea dos movimientos vinculados:
   * - TRANSFER_OUT en sucursal origen (cantidad negativa)
   * - TRANSFER_IN en sucursal destino (cantidad positiva)
   */
  async transferBetweenBranches(
    profileId: string,
    userId: string,
    itemId: string,
    sourceBranchId: string,
    targetBranchId: string,
    quantity: number,
    reason?: string,
  ): Promise<StockMovementResponse[]> {
    await this.verifyProfileOwnership(profileId, userId);
    await this.verifyItemBelongsToProfile(itemId, profileId);

    if (sourceBranchId === targetBranchId) {
      throw new BadRequestException(
        'La sucursal origen y destino deben ser diferentes',
      );
    }

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Validar stock suficiente en origen
    await this.validateNoNegativeStock(itemId, -quantity, sourceBranchId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Crear movimiento de salida (transfer_out)
      const outMovement = await tx.stockMovement.create({
        data: {
          itemId,
          type: MovementType.TRANSFER_OUT,
          quantity: -quantity,
          reason: reason ?? `Transferencia a sucursal ${targetBranchId}`,
          branchId: sourceBranchId,
          targetBranchId,
        },
      });

      // Crear movimiento de entrada (transfer_in) vinculado
      const inMovement = await tx.stockMovement.create({
        data: {
          itemId,
          type: MovementType.TRANSFER_IN,
          quantity: quantity,
          reason: reason ?? `Transferencia desde sucursal ${sourceBranchId}`,
          branchId: targetBranchId,
          targetBranchId: sourceBranchId,
          relatedMovementId: outMovement.id,
        },
      });

      // Actualizar el outMovement con la referencia al inMovement
      await tx.stockMovement.update({
        where: { id: outMovement.id },
        data: { relatedMovementId: inMovement.id },
      });

      // Actualizar stock global
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: { increment: 0 } }, // no cambia, es transferencia interna
      });

      // Actualizar balances por sucursal
      await this.upsertStockBalance(tx, itemId, sourceBranchId, -quantity);
      await this.upsertStockBalance(tx, itemId, targetBranchId, quantity);

      return [outMovement, inMovement];
    });

    const movements = await this.prisma.stockMovement.findMany({
      where: { id: { in: result.map((r) => r.id) } },
      include: {
        item: { select: { name: true } },
        branch: { select: { name: true } },
        targetBranch: { select: { name: true } },
      },
    });

    return movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      itemName: m.item.name,
      type: m.type as MovementType,
      quantity: m.quantity,
      displayQuantity: m.quantity > 0 ? `+${m.quantity}` : `${m.quantity}`,
      reason: m.reason,
      branchId: m.branchId,
      branchName: m.branch?.name ?? null,
      targetBranchId: m.targetBranchId,
      targetBranchName: m.targetBranch?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Calcula la cantidad con signo según el tipo de movimiento.
   *
   * Entradas: PURCHASE, INITIAL, RETURN, TRANSFER_IN → positivo
   * Salidas: SALE, TRANSFER_OUT → negativo
   * Ajuste: usa el signo de la cantidad original
   */
  private calculateSignedQuantity(
    type: MovementType,
    quantity: number,
  ): number {
    const entryTypes = [
      MovementType.PURCHASE,
      MovementType.INITIAL,
      MovementType.RETURN,
      MovementType.TRANSFER_IN,
    ];
    const exitTypes = [MovementType.SALE, MovementType.TRANSFER_OUT];

    if (entryTypes.includes(type)) {
      return Math.abs(quantity); // entrada: positivo
    }
    if (exitTypes.includes(type)) {
      return -Math.abs(quantity); // salida: negativo
    }
    if (type === MovementType.ADJUSTMENT) {
      // Ajuste: respeta el signo (puede subir o bajar)
      return quantity;
    }
    return quantity;
  }

  /**
   * Valida que después del movimiento el stock no quede negativo.
   */
  private async validateNoNegativeStock(
    itemId: string,
    proposedQty: number,
    branchId?: string,
  ): Promise<void> {
    let currentStock: number;

    if (branchId) {
      // Fase B: stock por sucursal
      const balance = await this.prisma.stockBalance.findUnique({
        where: { itemId_branchId: { itemId, branchId } },
      });
      currentStock = balance?.quantity ?? 0;
    } else {
      // Stock global
      const item = await this.prisma.inventoryItem.findUnique({
        where: { id: itemId },
        select: { currentStock: true },
      });
      if (!item) {
        throw new NotFoundException('Producto no encontrado');
      }
      currentStock = item.currentStock;
    }

    const projectedStock = currentStock + proposedQty;
    if (projectedStock < 0) {
      throw new BadRequestException(
        `Stock insuficiente. Stock actual: ${currentStock}, ` +
          `cantidad solicitada: ${Math.abs(proposedQty)}, ` +
          `resultado proyectado: ${projectedStock}`,
      );
    }
  }

  /**
   * Actualiza o crea el balance de stock para una sucursal (Fase B).
   */
  private async upsertStockBalance(
    tx: any,
    itemId: string,
    branchId: string,
    quantityChange: number,
  ): Promise<void> {
    await tx.stockBalance.upsert({
      where: { itemId_branchId: { itemId, branchId } },
      create: {
        itemId,
        branchId,
        quantity: Math.max(0, quantityChange),
      },
      update: {
        quantity: { increment: quantityChange },
      },
    });
  }

  /**
   * Verifica que el perfil pertenezca al usuario.
   */
  private async verifyProfileOwnership(
    profileId: string,
    userId: string,
  ): Promise<void> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
    });

    if (!profile) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este perfil',
      );
    }
  }

  /**
   * Verifica que el item pertenezca al perfil.
   */
  private async verifyItemBelongsToProfile(
    itemId: string,
    profileId: string,
  ): Promise<void> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, profileId },
    });

    if (!item) {
      throw new NotFoundException(
        'Producto no encontrado en este perfil',
      );
    }
  }
}
