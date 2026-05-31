import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Request } from 'express';

/**
 * Guard que verifica que el usuario autenticado sea dueño del perfil.
 *
 * Uso: @UseGuards(JwtAuthGuard, ProfileOwnerGuard)
 *
 * Extrae profileId de los parámetros de ruta (:profileId) y verifica
 * que el perfil pertenezca al userId del token JWT.
 *
 * Reglas:
 * - profileId debe existir en los parámetros.
 * - El perfil debe tener userId igual al usuario autenticado.
 * - Si no cumple, lanza ForbiddenException.
 *
 * TODO: Considerar caching de ownership para reducir queries en rutas frecuentes.
 */
@Injectable()
export class ProfileOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user as { userId: string } | undefined;

    if (!user?.userId) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const rawProfileId = request.params['profileId'];
    const profileId = Array.isArray(rawProfileId) ? rawProfileId[0] : rawProfileId;

    if (!profileId) {
      // Si no hay profileId en params, no aplicamos este guard
      // (permite pasar a otros guards o al controller)
      return true;
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!profile) {
      throw new ForbiddenException('Perfil no encontrado');
    }

    if (profile.userId !== user.userId) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este perfil',
      );
    }

    return true;
  }
}
