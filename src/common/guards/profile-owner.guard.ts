import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProfileOwnershipService } from '../services/profile-ownership.service';

/**
 * Guard que verifica que el usuario autenticado sea dueño del perfil.
 *
 * Uso: @UseGuards(ProfileOwnerGuard) — JwtAuthGuard ya es global (APP_GUARD).
 */
@Injectable()
export class ProfileOwnerGuard implements CanActivate {
  constructor(private readonly profileOwnership: ProfileOwnershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as { user?: { userId: string } }).user;

    if (!user?.userId) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const rawProfileId = request.params['profileId'];
    const profileId = Array.isArray(rawProfileId)
      ? rawProfileId[0]
      : rawProfileId;

    if (!profileId) {
      return true;
    }

    await this.profileOwnership.assertProfileOwner(profileId, user.userId);
    return true;
  }
}
