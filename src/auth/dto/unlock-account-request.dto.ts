import { IsEmail, MaxLength } from 'class-validator';

export class UnlockAccountRequestDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
