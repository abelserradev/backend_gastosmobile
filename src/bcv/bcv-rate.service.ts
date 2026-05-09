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
  isCaracasWeekendSatOrSun,
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
      return { vesPerUsd: cached.vesPerUsd, rateDate: cached.rateDate };
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
      const rowYmdRaw = typeof row.fecha === 'string' ? row.fecha.trim() : '';
      // DolarApi suele mandar solo "YYYY-MM-DD"; iso completo usaría TZ distinta si lo parseamos en UTC puro.
      const rowYmd =
        /^\d{4}-\d{2}-\d{2}$/.test(rowYmdRaw)
          ? rowYmdRaw
          : toCaracasYmdFromApiFecha(row.fecha);
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
    const rowExact = await this.prisma.bcVOfficialRate.findUnique({
      where: { rateDate },
    });
    if (rowExact) {
      return { vesPerUsd: rowExact.vesPerUsd, rateDate: rowExact.rateDate };
    }
    // Fin de semana en Caracas: sin cierre; se usa primera cotificación publicada *después* del fin de semana (p.ej. lunes).
    // Entre semana sin fila ese día en DolarApi: última publicada antes o ese día (huecos hábiles / feriados).
    const weekend = isCaracasWeekendSatOrSun(ymd);
    const fallback = weekend
      ? await this.pickOfficialOnOrAfter(rateDate)
      : await this.pickOfficialOnOrBefore(rateDate);
    if (fallback) {
      return fallback;
    }
    throw new BadRequestException(
      weekend
        ? `Sin cotización oficial después de ${ymd} en DolarApi (fin de semana / sin hábil siguiente aún cargado)`
        : `Sin cotización oficial para ${ymd} ni día hábil anterior con datos`,
    );
  }

  /**
   * Tasa del día en Caracas; si DolarApi falla, última fila en BD para no dejar sin USD
   * a quien fijó el ingreso en bolívares.
   */
  async getLatestVesPerUsdPreferToday(): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
    usedFallback: boolean;
  }> {
    const ymd = formatYmdInCaracas();
    try {
      const r = await this.getVesPerUsdForCalendarDay(ymd);
      return { ...r, usedFallback: false };
    } catch {
      const row = await this.prisma.bcVOfficialRate.findFirst({
        orderBy: { rateDate: 'desc' },
      });
      if (!row) {
        throw new ServiceUnavailableException(
          'Sin tasas en caché ni conexión para cotización oficial',
        );
      }
      return {
        vesPerUsd: row.vesPerUsd,
        rateDate: row.rateDate,
        usedFallback: true,
      };
    }
  }

  /** Primer día con tasa conocida después del fin de semana (p.ej. lunes). */
  private async pickOfficialOnOrAfter(anchor: Date): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
  } | null> {
    const row = await this.prisma.bcVOfficialRate.findFirst({
      where: { rateDate: { gte: anchor } },
      orderBy: { rateDate: 'asc' },
    });
    if (!row) {
      return null;
    }
    return { vesPerUsd: row.vesPerUsd, rateDate: row.rateDate };
  }

  /** Última tasa en o antes del día hábil (huecos tipo feriados/laborales sin publicación). */
  private async pickOfficialOnOrBefore(cutoff: Date): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
  } | null> {
    const row = await this.prisma.bcVOfficialRate.findFirst({
      where: { rateDate: { lte: cutoff } },
      orderBy: { rateDate: 'desc' },
    });
    if (!row) {
      return null;
    }
    return { vesPerUsd: row.vesPerUsd, rateDate: row.rateDate };
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
