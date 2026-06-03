import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Transferencia atómica entre sucursales (par TRANSFER_OUT + TRANSFER_IN).
 */
export class TransferStockDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  sourceBranchId!: string;

  @IsUUID()
  targetBranchId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
