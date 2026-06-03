import { IsEmail, IsOptional, IsEnum } from 'class-validator';
import { CollaboratorRole } from '@prisma/client';

export class InviteProfileCollaboratorDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(CollaboratorRole)
  role?: CollaboratorRole;
}
