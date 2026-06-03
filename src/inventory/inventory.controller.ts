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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfileAccessGuard } from '../common/guards/profile-access.guard';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';
import { InventoryService } from './inventory.service';
import { BranchService } from './branch.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';
import {
  AdjustStockDto,
  CreateStockMovementDto,
} from './dto/create-movement.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { ListInventoryItemsQuery, LowStockQuery } from './dto/list-items.query';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import type {
  BranchResponse,
  InventoryItemResponse,
  InventorySummaryResponse,
  StockBalanceResponse,
  StockMovementResponse,
} from './entities/inventory-item.response';

/**
 * Controller para gestión de inventario de perfiles tipo comercio.
 *
 * Rutas base: /me/profiles/:profileId/inventory
 *
 * Seguridad: JwtAuthGuard global + ProfileOwnerGuard por ruta.
 */
@Controller('me/profiles/:profileId/inventory')
@UseGuards(ProfileAccessGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly itemService: InventoryItemService,
    private readonly movementService: StockMovementService,
    private readonly branchService: BranchService,
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

  @Post('movements/transfer')
  @HttpCode(HttpStatus.CREATED)
  transferStock(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: TransferStockDto,
  ): Promise<StockMovementResponse[]> {
    return this.movementService.transferBetweenBranches(
      profileId,
      user.userId,
      dto.itemId,
      dto.sourceBranchId,
      dto.targetBranchId,
      dto.quantity,
      dto.reason,
    );
  }

  // ========== SUCURSALES (Fase B) ==========

  @Get('branches')
  listBranches(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<BranchResponse[]> {
    return this.branchService.listBranches(profileId, user.userId);
  }

  @Post('branches')
  @HttpCode(HttpStatus.CREATED)
  createBranch(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchResponse> {
    return this.branchService.createBranch(profileId, user.userId, dto);
  }

  @Patch('branches/:branchId')
  updateBranch(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchResponse> {
    return this.branchService.updateBranch(
      profileId,
      branchId,
      user.userId,
      dto,
    );
  }

  @Delete('branches/:branchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBranch(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<void> {
    await this.branchService.deleteBranch(profileId, branchId, user.userId);
  }

  @Get('items/:itemId/balances')
  listItemBalances(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<StockBalanceResponse[]> {
    return this.itemService.listItemBalances(profileId, itemId, user.userId);
  }
}
