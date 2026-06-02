import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../common/cache/cache.service';
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

/** Respuesta serializable en Redis para evitar pegarle a DolarApi en cada request. */
interface BcvDayCachePayload {
  vesPerUsd: string;
  rateDateYmd: string;
}

/** 26 h: cubre el día calendario Caracas aunque la tasa se publique tarde. */
const TTL_TODAY_MS = 26 * 60 * 60 * 1000;
/** Histórico en Redis: datos que ya están en Postgres no cambian. */
const TTL_HISTORIC_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class BcvRateService {
  /** Evita tormenta de requests concurrentes al mismo día cuando Redis/PG aún no tienen fila. */
  private readonly pendingDayFetches = new Map<
    string,
    Promise<{
      vesPerUsd: Prisma.Decimal;
      rateDate: Date;
      usedFallback: boolean;
    }>
  >();

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Bs por 1 USD para un día YYYY-MM-DD (Caracas); histórico en PG + caché caliente Redis/memoria. */
  async getVesPerUsdForCalendarDay(ymd: string): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
    usedFallback: boolean;
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
      return {
        vesPerUsd: cached.vesPerUsd,
        rateDate: cached.rateDate,
        usedFallback: false,
      };
    }

    const redisHit = await this.readDayFromCache(ymd);
    if (redisHit) {
      return { ...redisHit, usedFallback: false };
    }

    const pending = this.pendingDayFetches.get(ymd);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.resolveDayFromExternalSources(
      ymd,
      rateDate,
      todayCaracas,
    ).finally(() => {
      this.pendingDayFetches.delete(ymd);
    });
    this.pendingDayFetches.set(ymd, fetchPromise);
    return fetchPromise;
  }

  /**
   * Tasa del día en Caracas; si DolarApi falla, última fila en BD/Redis para no dejar sin USD
   * a quien fijó el ingreso en bolívares.
   */
  async getLatestVesPerUsdPreferToday(): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
    usedFallback: boolean;
  }> {
    const ymd = formatYmdInCaracas();
    try {
      return await this.getVesPerUsdForCalendarDay(ymd);
    } catch {
      const row = await this.prisma.bcVOfficialRate.findFirst({
        orderBy: { rateDate: 'desc' },
      });
      if (row) {
        return {
          vesPerUsd: row.vesPerUsd,
          rateDate: row.rateDate,
          usedFallback: true,
        };
      }
      const cached = await this.readLatestFromCache();
      if (cached) {
        return { ...cached, usedFallback: true };
      }
      throw new ServiceUnavailableException(
        'Sin tasas en caché ni conexión para cotización oficial',
      );
    }
  }

  private async resolveDayFromExternalSources(
    ymd: string,
    rateDate: Date,
    todayCaracas: string,
  ): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
    usedFallback: boolean;
  }> {
    if (ymd === todayCaracas) {
      try {
        const live = await this.fetchOfficialLive();
        const ves = new Prisma.Decimal(live.promedio);
        await this.persistDayRate(ymd, rateDate, ves);
        return { vesPerUsd: ves, rateDate, usedFallback: false };
      } catch {
        return this.fallbackToLastKnownRate(ymd);
      }
    }

    try {
      const list = await this.fetchOfficialHistorico();
      await this.ingestHistoricoRows(list);
    } catch {
      const fallback = await this.fallbackFromDbForYmd(ymd, rateDate);
      if (fallback) {
        return { ...fallback, usedFallback: true };
      }
      return this.fallbackToLastKnownRate(ymd);
    }

    const rowExact = await this.prisma.bcVOfficialRate.findUnique({
      where: { rateDate },
    });
    if (rowExact) {
      await this.writeDayToCache(ymd, rowExact.vesPerUsd, rowExact.rateDate);
      return {
        vesPerUsd: rowExact.vesPerUsd,
        rateDate: rowExact.rateDate,
        usedFallback: false,
      };
    }

    const fallback = await this.fallbackFromDbForYmd(ymd, rateDate);
    if (fallback) {
      return { ...fallback, usedFallback: true };
    }
    throw new BadRequestException(
      isCaracasWeekendSatOrSun(ymd)
        ? `Sin cotización oficial después de ${ymd} en DolarApi (fin de semana / sin hábil siguiente aún cargado)`
        : `Sin cotización oficial para ${ymd} ni día hábil anterior con datos`,
    );
  }

  private async fallbackFromDbForYmd(
    ymd: string,
    rateDate: Date,
  ): Promise<{ vesPerUsd: Prisma.Decimal; rateDate: Date } | null> {
    const weekend = isCaracasWeekendSatOrSun(ymd);
    const picked = weekend
      ? await this.pickOfficialOnOrAfter(rateDate)
      : await this.pickOfficialOnOrBefore(rateDate);
    return picked;
  }

  /** Última tasa conocida (Redis → Postgres) cuando la fuente externa no responde. */
  private async fallbackToLastKnownRate(ymd: string): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
    usedFallback: boolean;
  }> {
    const cached = await this.readLatestFromCache();
    if (cached) {
      return { ...cached, usedFallback: true };
    }
    const row = await this.prisma.bcVOfficialRate.findFirst({
      orderBy: { rateDate: 'desc' },
    });
    if (row) {
      await this.writeDayToCache(ymd, row.vesPerUsd, row.rateDate);
      return {
        vesPerUsd: row.vesPerUsd,
        rateDate: row.rateDate,
        usedFallback: true,
      };
    }
    throw new ServiceUnavailableException(
      'No se pudo obtener la tasa oficial actual (DolarApi) ni hay histórico en caché',
    );
  }

  private async persistDayRate(
    ymd: string,
    rateDate: Date,
    ves: Prisma.Decimal,
  ): Promise<void> {
    await this.prisma.bcVOfficialRate.upsert({
      where: { rateDate },
      create: { rateDate, vesPerUsd: ves },
      update: { vesPerUsd: ves, fetchedAt: new Date() },
    });
    await this.writeDayToCache(ymd, ves, rateDate);
  }

  private cacheKeyForDay(ymd: string): string {
    return `bcv:day:${ymd}`;
  }

  private async readDayFromCache(ymd: string): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
  } | null> {
    const payload = await this.cache.get<BcvDayCachePayload>(
      this.cacheKeyForDay(ymd),
    );
    if (!payload) {
      return null;
    }
    return {
      vesPerUsd: new Prisma.Decimal(payload.vesPerUsd),
      rateDate: parseYmdToUtcNoon(payload.rateDateYmd),
    };
  }

  private async readLatestFromCache(): Promise<{
    vesPerUsd: Prisma.Decimal;
    rateDate: Date;
  } | null> {
    const today = formatYmdInCaracas();
    const todayHit = await this.readDayFromCache(today);
    if (todayHit) {
      return todayHit;
    }
    return this.readDayFromCache('latest');
  }

  private async writeDayToCache(
    ymd: string,
    vesPerUsd: Prisma.Decimal,
    rateDate: Date,
  ): Promise<void> {
    const payload: BcvDayCachePayload = {
      vesPerUsd: vesPerUsd.toString(),
      rateDateYmd: rateDate.toISOString().slice(0, 10),
    };
    const today = formatYmdInCaracas();
    const ttl = ymd === today ? TTL_TODAY_MS : TTL_HISTORIC_MS;
    await this.cache.set(this.cacheKeyForDay(ymd), payload, ttl);
    if (ymd === today) {
      await this.cache.set('bcv:day:latest', payload, TTL_TODAY_MS);
    }
  }

  private async ingestHistoricoRows(
    list: DolarApiOficialHistoricoItem[],
  ): Promise<void> {
    for (const row of list) {
      const rowYmdRaw = typeof row.fecha === 'string' ? row.fecha.trim() : '';
      const rowYmd = /^\d{4}-\d{2}-\d{2}$/.test(rowYmdRaw)
        ? rowYmdRaw
        : toCaracasYmdFromApiFecha(row.fecha);
      const d = parseYmdToUtcNoon(rowYmd);
      const ves = new Prisma.Decimal(row.promedio);
      await this.prisma.bcVOfficialRate.upsert({
        where: { rateDate: d },
        create: { rateDate: d, vesPerUsd: ves },
        update: { vesPerUsd: ves, fetchedAt: new Date() },
      });
      await this.writeDayToCache(rowYmd, ves, d);
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
        throw new TypeError('Respuesta DolarApi sin promedio numérico');
      }
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo obtener la tasa oficial actual (DolarApi)',
      );
    }
  }

  private async fetchOfficialHistorico(): Promise<
    DolarApiOficialHistoricoItem[]
  > {
    try {
      const { data } = await firstValueFrom(
        this.http.get<DolarApiOficialHistoricoItem[]>(
          '/v1/historicos/dolares/oficial',
        ),
      );
      if (!Array.isArray(data)) {
        throw new TypeError('Histórico: se esperaba un array');
      }
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo obtener el histórico oficial (DolarApi)',
      );
    }
  }
}
