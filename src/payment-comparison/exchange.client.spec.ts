import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { ExchangeClient } from './exchange.client';
import { ComparisonUnavailableException } from './exchange.errors';

const comparacionV1 = {
  version: 'v1',
  computedAt: '2026-10-21T18:57:50.037Z',
  producto: null,
  tasas: {
    oficial: { valor: '883.396300', fechaFuente: '2026-10-21T13:00:00.000Z' },
    paralelo: { valor: '1100.000000', fechaFuente: '2026-10-21T13:05:00.000Z' },
    desactualizado: false,
  },
  tasaVenta: { valor: '1100.000000', origen: 'paralelo' },
  precioBs: null,
  opciones: [
    {
      id: 'bs',
      moneda: 'BS',
      montoCobrado: '391400.00',
      equivalenteBcvUsd: '443.06',
      comisionPct: null,
      comisionUsd: null,
      costoRealUsd: '355.82',
      costoRealBs: '391400.00',
      diferenciaVsMejorUsd: '0.00',
      esMejor: true,
    },
  ],
  mejores: ['bs'],
  empateTotal: false,
  ahorroUsd: '35.58',
  tasaEquilibrio: '1030.00',
  recargoBsPct: '16.60',
};

describe('ExchangeClient (GC-001)', () => {
  let client: ExchangeClient;
  let httpPost: jest.Mock;

  beforeEach(async () => {
    httpPost = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeClient,
        {
          provide: HttpService,
          useValue: { post: httpPost },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              const map: Record<string, unknown> = {
                PAYMENT_COMPARISON_ENABLED: 'true',
                EXCHANGE_API_URL: 'http://exchange.test',
                EXCHANGE_SERVICE_KEY: 'test-key',
                EXCHANGE_TIMEOUT_MS: 3000,
              };
              return map[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();
    client = module.get(ExchangeClient);
  });

  it('envía Bearer, X-Consumer-User y parsea respuesta v1', async () => {
    httpPost.mockReturnValue(of({ data: comparacionV1 }));

    const actual = await client.postComparacion('user-42', {
      metodos: ['bs'],
      precioBs: { modo: 'monto_bs', monto: '391400' },
    });

    expect(actual.version).toBe('v1');
    expect(actual.opciones).toHaveLength(1);
    expect(httpPost).toHaveBeenCalledWith(
      'http://exchange.test/api/v1/comparaciones',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'X-Consumer-User': 'user-42',
        }),
      }),
    );
  });

  it('propaga errores de campo en 400', async () => {
    const axiosErr = new AxiosError('bad request');
    axiosErr.response = {
      status: 400,
      data: { errores: { precioUsd: 'Requerido' } },
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpPost.mockReturnValue(throwError(() => axiosErr));

    await expect(
      client.postComparacion('u1', { metodos: ['efectivo'] }),
    ).rejects.toMatchObject({
      response: { errores: { precioUsd: 'Requerido' } },
    });
  });

  it('reintenta una vez en 502 y luego responde', async () => {
    const axiosErr = new AxiosError('bad gateway');
    axiosErr.response = {
      status: 502,
      data: {},
      statusText: 'Bad Gateway',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpPost
      .mockReturnValueOnce(throwError(() => axiosErr))
      .mockReturnValueOnce(of({ data: comparacionV1 }));

    const actual = await client.postComparacion('u1', { metodos: ['bs'] });
    expect(actual.mejores).toEqual(['bs']);
    expect(httpPost).toHaveBeenCalledTimes(2);
  });

  it('503 COMPARISON_UNAVAILABLE tras dos fallos 5xx', async () => {
    const axiosErr = new AxiosError('error');
    axiosErr.response = {
      status: 503,
      data: {},
      statusText: 'Unavailable',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpPost.mockReturnValue(throwError(() => axiosErr));

    await expect(client.postComparacion('u1', {})).rejects.toBeInstanceOf(
      ComparisonUnavailableException,
    );
    expect(httpPost).toHaveBeenCalledTimes(2);
  });
});
