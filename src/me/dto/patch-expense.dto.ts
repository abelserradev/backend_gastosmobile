import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PatchExpenseDto {
  @IsBoolean()
  isPaid!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paidByDisplayName?: string;
}