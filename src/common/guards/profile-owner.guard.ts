import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ProfileOwnershipService } from '../services/profile-ownership.service';
import { resolveProfileRouteAuth } from './profile-route-auth.util';

/**
 * Guard que verifica que el usuario autenticado sea dueño del perfil.
 *
 * Uso: @UseGuards(ProfileOwnerGuard) — JwtAuthGuard ya es global (APP_GUARD).
 */
@Injectable()
export class ProfileOwnerGuard implements CanActivate {
  constructor(private readonly profileOwnership: ProfileOwnershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { userId, profileId } = resolveProfileRouteAuth(context);

    if (!profileId) {
      return true;
    }

    await this.profileOwnership.assertProfileOwner(profileId, userId);
    return true;
  }
}
