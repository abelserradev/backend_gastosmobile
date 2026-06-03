import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAccessService } from '../common/services/profile-access.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import type { BranchResponse } from './entities/inventory-item.response';
import { mapBranchToResponse } from './inventory.mappers';

/**
 * CRUD de sucursales para perfiles comercio (FEAT-002 Fase B).
 */
@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileAccess: ProfileAccessService,
  ) {}

  async listBranches(
    profileId: string,
    userId: string,
  ): Promise<BranchResponse[]> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const branches = await this.prisma.branch.findMany({
      where: { profileId },
      orderBy: { name: 'asc' },
    });

    return branches.map(mapBranchToResponse);
  }

  async createBranch(
    profileId: string,
    userId: string,
    dto: CreateBranchDto,
  ): Promise<BranchResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);

    const branch = await this.prisma.branch.create({
      data: {
        profileId,
        name: dto.name.trim(),
        address: dto.address?.trim() ?? null,
        managerName: dto.managerName?.trim() ?? null,
      },
    });

    return mapBranchToResponse(branch);
  }

  async updateBranch(
    profileId: string,
    branchId: string,
    userId: string,
    dto: UpdateBranchDto,
  ): Promise<BranchResponse> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);
    await this.assertBranchBelongsToProfile(branchId, profileId);

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.address !== undefined && {
          address: dto.address.trim() || null,
        }),
        ...(dto.managerName !== undefined && {
          managerName: dto.managerName.trim() || null,
        }),
      },
    });

    return mapBranchToResponse(updated);
  }

  async deleteBranch(
    profileId: string,
    branchId: string,
    userId: string,
  ): Promise<void> {
    await this.profileAccess.assertInventoryAccess(profileId, userId);
    await this.assertBranchBelongsToProfile(branchId, profileId);

    const [movementCount, balanceWithStock] = await Promise.all([
      this.prisma.stockMovement.count({
        where: {
          OR: [{ branchId }, { targetBranchId: branchId }],
        },
      }),
      this.prisma.stockBalance.count({
        where: { branchId, quantity: { gt: 0 } },
      }),
    ]);

    if (movementCount > 0 || balanceWithStock > 0) {
      throw new BadRequestException(
        'No se puede eliminar una sucursal con movimientos o stock registrado.',
      );
    }

    await this.prisma.branch.delete({ where: { id: branchId } });
  }

  private async assertBranchBelongsToProfile(
    branchId: string,
    profileId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, profileId },
    });

    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada en este perfil');
    }
  }
}
