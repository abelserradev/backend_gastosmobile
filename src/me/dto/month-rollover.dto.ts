import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class MonthRolloverDto {
  /** Solo aplica si hay saldo sobrante del mes que cierra; true = sumarlo al mes entrante. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  applySurplus?: boolean;
}
