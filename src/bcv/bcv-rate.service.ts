import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import {
  formatYmdInCaracas,
  parseYmdToUtcNoon,
  toCaracasYmdFromApiFecha,
} from '../common/utils/caracas-date';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DolarApiOficialHistoricoItem,
  DolarApiOficialVivo,
} from './dolar-api.types';

@Injectable()
export class BcvRateService {
  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /** Bs por 1 USD para un día YYYY-MM-DD (Caracas); cache en `BcVOfficialRate`. */
  async getVesPerUsdForCalendarDay(ymd: string): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
  }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new BadRequestException('Fecha inválida (use YYYY-MM-DD)');
    }
    const todayCaracas = formatYmdInCaracas();
    if (ymd > todayCaracas) {
      throw new BadRequestException('No hay tasa para fechas futuras');
    }
    const rateDate = parseYmdToUtcNoon(ymd);
    const cached = await this.prisma.bcVOfficialRate.findUnique({
      where: { rateDate },
    });
    if (cached) {
      return { vesPerUsd: cached.vesPerUsd, rateDate };
    }
    if (ymd === todayCaracas) {
      const live = await this.fetchOfficialLive();
      const ves = new Prisma.Decimal(live.promedio);
      await this.prisma.bcVOfficialRate.upsert({
        where: { rateDate },
        create: { rateDate, vesPerUsd: ves },
        update: { vesPerUsd: ves, fetchedAt: new Date() },
      });
      return { vesPerUsd: ves, rateDate };
    }
    const list = await this.fetchOfficialHistorico();
    for (const row of list) {
      const rowYmd = toCaracasYmdFromApiFecha(row.fecha);
      const d = parseYmdToUtcNoon(rowYmd);
      await this.prisma.bcVOfficialRate.upsert({
        where: { rateDate: d },
        create: {
          rateDate: d,
          vesPerUsd: new Prisma.Decimal(row.promedio),
        },
        update: {
          vesPerUsd: new Prisma.Decimal(row.promedio),
          fetchedAt: new Date(),
        },
      });
    }
    const row = await this.prisma.bcVOfficialRate.findUnique({
      where: { rateDate },
    });
    if (!row) {
      throw new BadRequestException(
        `Sin cotización oficial en DolarApi para ${ymd}`,
      );
    }
    return { vesPerUsd: row.vesPerUsd, rateDate };
  }

  private async fetchOfficialLive(): Promise<DolarApiOficialVivo> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<DolarApiOficialVivo>('/v1/dolares/oficial'),
      );
      if (typeof data?.promedio !== 'number' || Number.isNaN(data.promedio)) {
        throw new Error('Respuesta DolarApi sin promedio numérico');
      }
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo obtener la tasa oficial actual (DolarApi)',
      );
    }
  }

  private async fetchOfficialHistorico(): Promise<DolarApiOficialHistoricoItem[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<DolarApiOficialHistoricoItem[]>(
          '/v1/historicos/dolares/oficial',
        ),
      );
      if (!Array.isArray(data)) {
        throw new Error('Histórico: se esperaba un array');
      }
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo obtener el histórico oficial (DolarApi)',
      );
    }
  }
}
