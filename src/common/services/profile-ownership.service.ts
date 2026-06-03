import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Profile, ProfileType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Verificación centralizada de pertenencia de perfil (DRY entre me/ e inventory/).
 *
 * Evita repetir findFirst + ForbiddenException en cada servicio de dominio.
 */
@Injectable()
export class ProfileOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnedProfile(
    profileId: string,
    userId: string,
  ): Promise<Profile> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
    });

    if (!profile) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este perfil',
      );
    }

    return profile;
  }

  async assertProfileOwner(profileId: string, userId: string): Promise<void> {
    await this.getOwnedProfile(profileId, userId);
  }

  async assertComercioProfile(profileId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil no encontrado');
    }

    if (profile.type !== ('comercio' satisfies ProfileType)) {
      throw new BadRequestException(
        'El perfil no es de tipo comercio. Solo perfiles comercio tienen inventario.',
      );
    }

    return profile;
  }

  async assertOwnedComercioProfile(
    profileId: string,
    userId: string,
  ): Promise<Profile> {
    const profile = await this.getOwnedProfile(profileId, userId);
    if (profile.type !== 'comercio') {
      throw new BadRequestException(
        'El perfil no es de tipo comercio. Solo perfiles comercio tienen inventario.',
      );
    }
    return profile;
  }
}
