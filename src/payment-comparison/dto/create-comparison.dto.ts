import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const METODOS_VALIDOS = ['efectivo', 'electronico', 'bs'] as const;
const MODOS_BS = ['monto_bs', 'usd_bcv', 'usd_otra_tasa'] as const;

export class PrecioBsDto {
  @IsIn([...MODOS_BS])
  modo!: (typeof MODOS_BS)[number];

  @ValidateIf((o: PrecioBsDto) => o.modo === 'monto_bs')
  @IsNumberString()
  monto?: string;

  @ValidateIf(
    (o: PrecioBsDto) => o.modo === 'usd_bcv' || o.modo === 'usd_otra_tasa',
  )
  @IsNumberString()
  montoUsd?: string;

  @ValidateIf((o: PrecioBsDto) => o.modo === 'usd_otra_tasa')
  @IsNumberString()
  tasaVendedor?: string;
}

/** Oferta enviada a Exchange v1 (GC-002). */
export class CreateComparisonDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(METODOS_VALIDOS, { each: true })
  metodos!: (typeof METODOS_VALIDOS)[number][];

  @ValidateIf(
    (o: CreateComparisonDto) =>
      o.metodos?.includes('efectivo') || o.metodos?.includes('electronico'),
  )
  @IsNumberString()
  precioUsd?: string;

  @ValidateIf((o: CreateComparisonDto) => o.metodos?.includes('bs'))
  @ValidateNested()
  @Type(() => PrecioBsDto)
  precioBs?: PrecioBsDto;

  @IsOptional()
  @IsNumberString()
  comisionElectronicoPct?: string;

  @IsOptional()
  @IsNumberString()
  tasaVenta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  producto?: string;
}

/** Serializa el DTO al JSON que espera Exchange (strings decimales). */
export function buildExchangeOfferPayload(
  dto: CreateComparisonDto,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    metodos: dto.metodos,
    comisionElectronicoPct: dto.comisionElectronicoPct ?? '0',
  };
  if (dto.precioUsd != null) {
    payload.precioUsd = dto.precioUsd;
  }
  if (dto.precioBs != null) {
    payload.precioBs = dto.precioBs;
  }
  if (dto.tasaVenta != null) {
    payload.tasaVenta = dto.tasaVenta;
  }
  if (dto.producto?.trim()) {
    payload.producto = dto.producto.trim();
  }
  return payload;
}
