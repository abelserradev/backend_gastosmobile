import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ProfileType } from '@prisma/client';

export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(ProfileType)
  type!: ProfileType;
}
