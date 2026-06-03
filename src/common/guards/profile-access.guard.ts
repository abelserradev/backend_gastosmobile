import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProfileAccessService } from '../services/profile-access.service';

/**
 * Guard de inventario: dueño del perfil comercio o colaborador aceptado (FEAT-003).
 */
@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(private readonly profileAccess: ProfileAccessService) {}

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

    await this.profileAccess.assertInventoryAccess(profileId, user.userId);
    return true;
  }
}
