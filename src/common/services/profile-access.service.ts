import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CollaboratorRole, Profile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfileOwnershipService } from './profile-ownership.service';

export type ProfileAccessKind = 'owner' | 'collaborator';

export interface ProfileInventoryAccess {
  access: ProfileAccessKind;
  profile: Profile;
  collaboratorRole?: CollaboratorRole;
}

/**
 * Acceso a perfil comercio: dueño o colaborador aceptado (FEAT-003).
 */
@Injectable()
export class ProfileAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileOwnership: ProfileOwnershipService,
  ) {}

  async assertInventoryAccess(
    profileId: string,
    userId: string,
  ): Promise<ProfileInventoryAccess> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil no encontrado');
    }

    if (profile.type !== 'comercio') {
      throw new BadRequestException(
        'El perfil no es de tipo comercio. Solo perfiles comercio tienen inventario.',
      );
    }

    if (profile.userId === userId) {
      return { access: 'owner', profile };
    }

    const collaboration = await this.prisma.profileCollaborator.findUnique({
      where: { profileId_userId: { profileId, userId } },
    });

    if (
      !collaboration ||
      collaboration.status !== 'accepted' ||
      collaboration.role !== 'editor'
    ) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este inventario',
      );
    }

    return {
      access: 'collaborator',
      profile,
      collaboratorRole: collaboration.role,
    };
  }

  async isOwner(profileId: string, userId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });
    return profile?.userId === userId;
  }

  async assertOwnerOnly(profileId: string, userId: string): Promise<Profile> {
    return this.profileOwnership.getOwnedProfile(profileId, userId);
  }
}
