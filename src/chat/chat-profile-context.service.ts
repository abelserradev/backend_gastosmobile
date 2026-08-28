import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Profile, ProfileType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ChatProfileContextBlock } from './dto/chat-message.dto';

type ProfileAccess = 'owner' | 'collaborator';

@Injectable()
export class ChatProfileContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Contexto seguro para el LLM: solo metadatos del perfil, validados en BD.
   * Sin montos, gastos ni IDs internos en el prompt.
   */
  async resolverContexto(
    userId: string,
    profileId?: string,
  ): Promise<ChatProfileContextBlock> {
    const prefs = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: { defaultCurrency: true },
    });
    const currency = prefs?.defaultCurrency;

    if (profileId?.trim()) {
      const perfil = await this.assertAccesoPerfil(profileId.trim(), userId);
      const branchCount =
        perfil.type === 'comercio'
          ? await this.prisma.branch.count({ where: { profileId: perfil.id } })
          : 0;
      return {
        mode: 'single',
        activeProfileName: perfil.name,
        activeProfileType: perfil.type,
        access: perfil.access,
        inventoryEnabled: perfil.type === 'comercio',
        branchCount: branchCount > 0 ? branchCount : undefined,
        currency,
      };
    }

    const perfiles = await this.listarPerfilesAccesibles(userId);
    return {
      mode: 'overview',
      currency,
      otherProfilesSummary: perfiles.map(
        (p) => `${p.name} (${p.type}, ${p.access === 'owner' ? 'propio' : 'colaborador'})`,
      ),
    };
  }

  private async assertAccesoPerfil(
    profileId: string,
    userId: string,
  ): Promise<Profile & { access: ProfileAccess }> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Perfil no encontrado');
    }
    if (profile.userId === userId) {
      return { ...profile, access: 'owner' };
    }
    const collab = await this.prisma.profileCollaborator.findUnique({
      where: { profileId_userId: { profileId, userId } },
    });
    if (collab?.status === 'accepted') {
      return { ...profile, access: 'collaborator' };
    }
    throw new ForbiddenException('No tienes acceso a este perfil');
  }

  private async listarPerfilesAccesibles(
    userId: string,
  ): Promise<Array<{ name: string; type: ProfileType; access: ProfileAccess }>> {
    const owned = await this.prisma.profile.findMany({
      where: { userId },
      select: { name: true, type: true },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });
    const collabs = await this.prisma.profileCollaborator.findMany({
      where: { userId, status: 'accepted' },
      include: { profile: { select: { name: true, type: true } } },
      take: 8,
    });
    const lista = [
      ...owned.map((p) => ({ ...p, access: 'owner' as const })),
      ...collabs.map((c) => ({
        name: c.profile.name,
        type: c.profile.type,
        access: 'collaborator' as const,
      })),
    ];
    return lista;
  }
}
