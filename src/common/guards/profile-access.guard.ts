import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ProfileAccessService } from '../services/profile-access.service';
import { resolveProfileRouteAuth } from './profile-route-auth.util';

/**
 * Guard de inventario: dueño del perfil comercio o colaborador aceptado (FEAT-003).
 */
@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(private readonly profileAccess: ProfileAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { userId, profileId } = resolveProfileRouteAuth(context);

    if (!profileId) {
      return true;
    }

    await this.profileAccess.assertInventoryAccess(profileId, userId);
    return true;
  }
}
