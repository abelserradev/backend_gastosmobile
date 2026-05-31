import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ProfileType } from '@prisma/client';

/**
 * DTO para crear un perfil bajo el usuario autenticado.
 *
 * Tipos de perfil (FEAT-002 incluye 'comercio'):
 * - familiar: control de gastos personal/familia
 * - grupal: gastos compartidos con integrantes
 * - comercio: control de inventario y stock para negocios
 *
 * Perfil comercio habilita el módulo de inventario (/me/profiles/:id/inventory).
 */
export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(ProfileType)
  type!: ProfileType;
}
