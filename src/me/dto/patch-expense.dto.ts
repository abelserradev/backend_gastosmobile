import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PatchExpenseDto {
  @IsBoolean()
  isPaid!: boolean;

  /** Integrante seleccionado desde el perfil (preferido). */
  @IsOptional()
  @IsUUID()
  paidByMemberId?: string;

  /** Legacy/compat: texto libre (deprecado). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paidByDisplayName?: string;
}
