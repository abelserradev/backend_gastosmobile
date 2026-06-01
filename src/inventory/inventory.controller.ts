import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';
import {
  AdjustStockDto,
  CreateStockMovementDto,
} from './dto/create-movement.dto';
import {
  ListInventoryItemsQuery,
  LowStockQuery,
} from './dto/list-items.query';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import type {
  InventoryItemResponse,
  InventorySummaryResponse,
  StockMovementResponse,
} from './entities/inventory-item.response';

/**
 * Controller para gestión de inventario de perfiles tipo comercio.
 *
 * Rutas base: /me/profiles/:profileId/inventory
 *
 * Endpoints:
 * - GET    /items                    → Listar productos
 * - POST   /items                    → Crear producto
 * - GET    /items/low-stock          → Productos con stock bajo
 * - GET    /items/:itemId            → Ver producto
 * - PATCH  /items/:itemId            → Actualizar producto
 * - DELETE /items/:itemId            → Eliminar producto (restricciones aplican)
 * - GET    /items/:itemId/movements  → Historial de movimientos
 * - POST   /movements                → Registrar movimiento
 * - POST   /movements/adjust         → Ajuste de stock
 * - GET    /summary                  → Resumen del inventario
 *
 * Seguridad:
 * - JwtAuthGuard: requiere token válido.
 * - ProfileOwnerGuard: verifica que el perfil pertenezca al usuario autenticado.
 *
 * TODO: Implementar ProfileOwnerGuard compartido (actualmente validación en servicio).
 */
@Controller('me/profiles/:profileId/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly itemService: InventoryItemService,
    private readonly movementService: StockMovementService,
  ) {}

  // ========== RESUMEN ==========

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<InventorySummaryResponse> {
    return this.inventoryService.getSummary(profileId, user.userId);
  }

  // ========== PRODUCTOS (ITEMS) ==========

  @Get('items')
  listItems(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: ListInventoryItemsQuery,
  ): Promise<InventoryItemResponse[]> {
    return this.itemService.listItems(profileId, user.userId, query.search);
  }

  @Get('items/low-stock')
  listLowStock(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() _query: LowStockQuery,
  ): Promise<InventoryItemResponse[]> {
    return this.itemService.listLowStock(profileId, user.userId);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateInventoryItemDto,
  ): Promise<InventoryItemResponse> {
    return this.itemService.createItem(profileId, user.userId, dto);
  }

  @Get('items/:itemId')
  getItem(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<InventoryItemResponse> {
    return this.itemService.getItem(profileId, itemId, user.userId);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemResponse> {
    return this.itemService.updateItem(profileId, itemId, user.userId, dto);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.itemService.deleteItem(profileId, itemId, user.userId);
  }

  // ========== MOVIMIENTOS ==========

  @Get('items/:itemId/movements')
  listMovements(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('branchId') branchId?: string,
  ): Promise<StockMovementResponse[]> {
    return this.movementService.listMovements(
      profileId,
      itemId,
      user.userId,
      branchId,
    );
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  createMovement(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateStockMovementDto,
  ): Promise<StockMovementResponse> {
    return this.movementService.createMovement(profileId, user.userId, dto);
  }

  @Post('movements/adjust')
  @HttpCode(HttpStatus.CREATED)
  adjustStock(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: AdjustStockDto,
  ): Promise<StockMovementResponse> {
    return this.movementService.adjustStock(profileId, user.userId, dto);
  }
}
