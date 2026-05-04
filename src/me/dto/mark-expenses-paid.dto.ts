import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Marca varios gastos pendientes como pagados con un solo correo de resumen (Resend). */
export class MarkExpensesPaidDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paidByDisplayName!: string;

  @IsOptional()
  @IsUUID()
  paidByMemberId?: string;
}
