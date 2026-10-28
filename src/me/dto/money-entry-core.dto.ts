import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Campos compartidos al crear gasto o ingreso (montos en USD/BS + periodo presupuestario). */
export abstract class CreateMoneyEntryCoreDto {
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

  /** Si amount viene en Bs, el backend convierte a USD con tasa BCV del día de pago/ingreso. */
  @IsOptional()
  @IsIn(['USD', 'BS'])
  amountCurrency?: 'USD' | 'BS';

  /** Debe coincidir con el periodStart activo al registrar; si omites, el backend lo asigna. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  referenceMonth?: string;
}

/** Monto/título parcial para updates vía Telegram o API. */
export abstract class UpdateMoneyEntryCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsIn(['USD', 'BS'])
  amountCurrency?: 'USD' | 'BS';
}
