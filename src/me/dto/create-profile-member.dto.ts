import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProfileMemberDto {
  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(60)
  displayName!: string;
}
