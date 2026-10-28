import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

export type ProfileRouteAuth = {
  userId: string;
  profileId: string | undefined;
};

/**
 * Extrae userId JWT y profileId de ruta (:profileId) para guards de perfil.
 * Sin profileId en params la ruta no exige chequeo de ownership/acceso inventario.
 */
export function resolveProfileRouteAuth(
  context: ExecutionContext,
): ProfileRouteAuth {
  const request = context.switchToHttp().getRequest<Request>();
  const user = (request as { user?: { userId: string } }).user;

  if (!user?.userId) {
    throw new ForbiddenException('Usuario no autenticado');
  }

  const rawProfileId = request.params['profileId'];
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;

  return { userId: user.userId, profileId };
}
