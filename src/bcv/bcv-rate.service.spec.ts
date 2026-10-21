import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { parseYmdToUtcNoon } from '../common/utils/caracas-date';
import { BcvRateService } from './bcv-rate.service';

// Miércoles 21/10/2026, 10:00 en Caracas (UTC-4)
const AHORA = new Date('2026-10-21T14:00:00.000Z');
const HOY = '2026-10-21';
const AYER = '2026-10-20';

function filaTasa(ymd: string, ves: string) {
  return {
    id: `row-${ymd}`,
    rateDate: parseYmdToUtcNoon(ymd),
    vesPerUsd: new Prisma.Decimal(ves),
    fetchedAt: AHORA,
  };
}

/** Caché en memoria con la misma forma que CacheService (sin Redis). */
function crearCacheFalsa() {
  const datos = new Map<string, unknown>();
  return {
    datos,
    get: jest.fn((key: string) => Promise.resolve(datos.get(key) ?? null)),
    set: jest.fn((key: string, value: unknown) => {
      datos.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      datos.delete(key);
      return Promise.resolve();
    }),
  };
}

describe('BcvRateService', () => {
  let service: BcvRateService;
  let cache: ReturnType<typeof crearCacheFalsa>;
  const http = { get: jest.fn() };
  const prisma = {
    bcVOfficialRate: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.useFakeTimers({
      now: AHORA,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.clearAllMocks();
    cache = crearCacheFalsa();
    prisma.bcVOfficialRate.findUnique.mockResolvedValue(null);
    prisma.bcVOfficialRate.findFirst.mockResolvedValue(null);
    prisma.bcVOfficialRate.upsert.mockResolvedValue(undefined);
    service = new BcvRateService(
      http as never,
      prisma as never,
      cache as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('usa la fila de Postgres sin llamar a DolarApi', async () => {
    prisma.bcVOfficialRate.findUnique.mockResolvedValue(filaTasa(HOY, '210.5'));

    const actual = await service.getVesPerUsdForCalendarDay(HOY);

    expect(actual.vesPerUsd.toString()).toBe('210.5');
    expect(actual.usedFallback).toBe(false);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('usa Redis cuando Postgres no tiene el día', async () => {
    cache.datos.set(`bcv:day:${HOY}`, { vesPerUsd: '211', rateDateYmd: HOY });

    const actual = await service.getVesPerUsdForCalendarDay(HOY);

    expect(actual.vesPerUsd.toString()).toBe('211');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('consulta DolarApi para hoy, persiste en PG y en caché', async () => {
    http.get.mockReturnValue(of({ data: { promedio: 212.25 } }));

    const actual = await service.getVesPerUsdForCalendarDay(HOY);

    expect(actual).toMatchObject({ usedFallback: false });
    expect(actual.vesPerUsd.toString()).toBe('212.25');
    expect(prisma.bcVOfficialRate.upsert).toHaveBeenCalledTimes(1);
    expect(cache.datos.get(`bcv:day:${HOY}`)).toEqual({
      vesPerUsd: '212.25',
      rateDateYmd: HOY,
    });
  });

  it('si DolarApi cae, devuelve la última tasa conocida marcada como fallback', async () => {
    http.get.mockReturnValue(throwError(() => new Error('timeout')));
    prisma.bcVOfficialRate.findFirst.mockResolvedValue(filaTasa(AYER, '209'));

    const actual = await service.getVesPerUsdForCalendarDay(HOY);

    expect(actual.usedFallback).toBe(true);
    expect(actual.vesPerUsd.toString()).toBe('209');
  });

  it('sin DolarApi ni histórico responde 503', async () => {
    http.get.mockReturnValue(throwError(() => new Error('timeout')));

    await expect(
      service.getVesPerUsdForCalendarDay(HOY),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('agrupa peticiones concurrentes del mismo día en una sola consulta', async () => {
    http.get.mockReturnValue(of({ data: { promedio: 212 } }));

    await Promise.all([
      service.getVesPerUsdForCalendarDay(HOY),
      service.getVesPerUsdForCalendarDay(HOY),
    ]);

    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it.each(['2026-10-22', '21-10-2026'])('rechaza la fecha %s', async (ymd) => {
    await expect(
      service.getVesPerUsdForCalendarDay(ymd),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
