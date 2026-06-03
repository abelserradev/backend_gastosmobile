import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * DTO para crear una sucursal en un perfil comercio (FEAT-002 Fase B).
 */
export class CreateBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  managerName?: string;
}
