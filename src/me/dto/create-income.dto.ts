import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateIncomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ValidateIf((o: CreateIncomeDto) => !o.sourceId)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceName?: string;

  /** YYYY-MM-DD; si omites, periodo activo (Caracas + corte). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  referenceMonth?: string;

  /** Día del ingreso para tasa BCV. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  receivedDate?: string;
}
