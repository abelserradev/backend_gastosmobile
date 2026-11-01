import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const OPCIONES_VALIDAS = ['efectivo', 'electronico', 'bs'] as const;

/** Cuerpo de POST /api/me/comparisons/:id/expense (GC-005). */
export class ConvertComparisonExpenseDto {
  @IsIn([...OPCIONES_VALIDAS])
  optionId!: (typeof OPCIONES_VALIDAS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ValidateIf((o: ConvertComparisonExpenseDto) => !o.categoryId)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  categoryName?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;
}
