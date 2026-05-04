import { IsString, MaxLength, MinLength } from 'class-validator';

/** Primera contraseña tras Google (sesión JWT) o mismo min que registro. */
export class SetupPasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password!: string;
}
