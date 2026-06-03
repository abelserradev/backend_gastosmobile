import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProfileCollaborator } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAccessService } from '../common/services/profile-access.service';
import { ProfileOwnershipService } from '../common/services/profile-ownership.service';
import { InviteProfileCollaboratorDto } from './dto/invite-profile-collaborator.dto';
import type {
  ProfileCollaboratorResponse,
  ProfileInvitationResponse,
  UserProfileListItemResponse,
} from './profile-collaborator.response';

@Injectable()
export class ProfileCollaboratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileAccess: ProfileAccessService,
    private readonly profileOwnership: ProfileOwnershipService,
  ) {}

  async listProfilesForUser(
    userId: string,
  ): Promise<UserProfileListItemResponse[]> {
    const owned = await this.prisma.profile.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true },
    });

    const ownedItems: UserProfileListItemResponse[] = owned.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      access: 'owner',
    }));

    const shared = await this.prisma.profileCollaborator.findMany({
      where: { userId, status: 'accepted' },
      include: {
        profile: { select: { id: true, name: true, type: true } },
        invitedBy: { select: { name: true } },
      },
      orderBy: { acceptedAt: 'asc' },
    });

    const sharedItems: UserProfileListItemResponse[] = shared
      .filter((row) => row.profile.type === 'comercio')
      .map((row) => ({
        id: row.profile.id,
        name: row.profile.name,
        type: row.profile.type,
        access: 'collaborator',
        ownerName: row.invitedBy.name || null,
      }));

    return [...ownedItems, ...sharedItems];
  }

  async invite(
    profileId: string,
    ownerUserId: string,
    dto: InviteProfileCollaboratorDto,
  ): Promise<ProfileCollaboratorResponse> {
    const profile = await this.profileOwnership.assertOwnedComercioProfile(
      profileId,
      ownerUserId,
    );

    const email = dto.email.trim().toLowerCase();
    const invitee = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (!invitee) {
      throw new NotFoundException(
        'Usuario no encontrado en la plataforma. Debe estar registrado.',
      );
    }

    if (invitee.id === ownerUserId) {
      throw new BadRequestException('No puedes invitarte a ti mismo');
    }

    const existing = await this.prisma.profileCollaborator.findUnique({
      where: { profileId_userId: { profileId, userId: invitee.id } },
      include: {
        profile: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
    });

    if (existing?.status === 'pending') {
      throw new BadRequestException(
        'Ya existe una invitación pendiente para este usuario',
      );
    }

    if (existing?.status === 'accepted') {
      throw new ConflictException(
        'Este usuario ya es colaborador del perfil',
      );
    }

    let row: ProfileCollaborator & {
      profile: { name: string };
      user: { email: string | null; name: string };
    };

    if (existing) {
      row = await this.prisma.profileCollaborator.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          role: dto.role ?? 'editor',
          invitedById: ownerUserId,
          acceptedAt: null,
        },
        include: {
          profile: { select: { name: true } },
          user: { select: { email: true, name: true } },
        },
      });
    } else {
      row = await this.prisma.profileCollaborator.create({
        data: {
          profileId: profile.id,
          userId: invitee.id,
          invitedById: ownerUserId,
          role: dto.role ?? 'editor',
        },
        include: {
          profile: { select: { name: true } },
          user: { select: { email: true, name: true } },
        },
      });
    }

    return this.mapCollaborator(row);
  }

  async listByProfile(
    profileId: string,
    ownerUserId: string,
  ): Promise<ProfileCollaboratorResponse[]> {
    await this.profileOwnership.assertOwnedComercioProfile(
      profileId,
      ownerUserId,
    );

    const rows = await this.prisma.profileCollaborator.findMany({
      where: {
        profileId,
        status: { in: ['pending', 'accepted'] },
      },
      include: {
        profile: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => this.mapCollaborator(row));
  }

  async revoke(
    profileId: string,
    ownerUserId: string,
    collaboratorUserId: string,
  ): Promise<void> {
    await this.profileOwnership.assertOwnedComercioProfile(
      profileId,
      ownerUserId,
    );

    const row = await this.prisma.profileCollaborator.findUnique({
      where: {
        profileId_userId: { profileId, userId: collaboratorUserId },
      },
    });

    if (!row) {
      throw new NotFoundException('Colaborador no encontrado');
    }

    if (row.status === 'pending') {
      await this.prisma.profileCollaborator.delete({ where: { id: row.id } });
      return;
    }

    await this.prisma.profileCollaborator.update({
      where: { id: row.id },
      data: { status: 'revoked', acceptedAt: null },
    });
  }

  async listPendingInvitations(
    userId: string,
  ): Promise<ProfileInvitationResponse[]> {
    const rows = await this.prisma.profileCollaborator.findMany({
      where: { userId, status: 'pending' },
      include: {
        profile: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      profileName: row.profile.name,
      invitedByName: row.invitedBy.name || 'Usuario',
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async acceptInvitation(
    invitationId: string,
    userId: string,
  ): Promise<ProfileCollaboratorResponse> {
    const row = await this.findPendingInvitation(invitationId, userId);

    const updated = await this.prisma.profileCollaborator.update({
      where: { id: row.id },
      data: { status: 'accepted', acceptedAt: new Date() },
      include: {
        profile: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
    });

    return this.mapCollaborator(updated);
  }

  async rejectInvitation(invitationId: string, userId: string): Promise<void> {
    const row = await this.findPendingInvitation(invitationId, userId);

    await this.prisma.profileCollaborator.update({
      where: { id: row.id },
      data: { status: 'rejected' },
    });
  }

  private async findPendingInvitation(invitationId: string, userId: string) {
    const row = await this.prisma.profileCollaborator.findFirst({
      where: { id: invitationId, userId, status: 'pending' },
    });

    if (!row) {
      throw new NotFoundException('Invitación no encontrada');
    }

    return row;
  }

  private mapCollaborator(row: {
    id: string;
    profileId: string;
    profile: { name: string };
    userId: string;
    user: { email: string | null; name: string };
    invitedById: string;
    status: ProfileCollaborator['status'];
    role: ProfileCollaborator['role'];
    createdAt: Date;
    acceptedAt: Date | null;
  }): ProfileCollaboratorResponse {
    return {
      id: row.id,
      profileId: row.profileId,
      profileName: row.profile.name,
      userId: row.userId,
      userEmail: row.user.email ?? '',
      userName: row.user.name,
      invitedById: row.invitedById,
      status: row.status,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
    };
  }
}
