import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  ExchangeContractError,
  parseComparacionV1,
  parseExchangeFieldErrors,
  type ComparacionV1,
} from './exchange-contract';
import {
  ComparisonUnavailableException,
  ExchangeRateLimitedException,
  ExchangeValidationException,
} from './exchange.errors';
import {
  resolveExchangeClientSettings,
  type ExchangeClientSettings,
} from './payment-comparison.config';

const RETRY_DELAY_MS = 300;
const MAX_ATTEMPTS = 2;

@Injectable()
export class ExchangeClient {
  private readonly logger = new Logger(ExchangeClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** GC-001: POST /api/v1/comparaciones con clave de servicio y usuario consumidor. */
  async postComparacion(
    consumerUserId: string,
    offer: Record<string, unknown>,
  ): Promise<ComparacionV1> {
    const settings = resolveExchangeClientSettings(this.config);
    if (!settings) {
      throw new ComparisonUnavailableException(
        'Comparación de pagos deshabilitada o sin EXCHANGE_API_URL / EXCHANGE_SERVICE_KEY',
      );
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.ejecutarPost(settings, consumerUserId, offer);
      } catch (err) {
        const decision = this.clasificarError(err, attempt);
        if (decision.kind === 'throw') {
          throw decision.error;
        }
        if (decision.kind === 'retry') {
          await this.pausaReintento();
        }
      }
    }

    throw new ComparisonUnavailableException();
  }

  private async ejecutarPost(
    settings: ExchangeClientSettings,
    consumerUserId: string,
    offer: Record<string, unknown>,
  ): Promise<ComparacionV1> {
    const url = `${settings.baseUrl}/api/v1/comparaciones`;
    const response = await firstValueFrom(
      this.http.post<unknown>(url, offer, {
        timeout: settings.timeoutMs,
        headers: {
          Authorization: `Bearer ${settings.serviceKey}`,
          'X-Consumer-User': consumerUserId,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }),
    );
    return parseComparacionV1(response.data);
  }

  private clasificarError(
    err: unknown,
    attempt: number,
  ):
    | { kind: 'throw'; error: Error }
    | { kind: 'retry' }
    | { kind: 'unreachable' } {
    if (err instanceof ExchangeValidationException) {
      return { kind: 'throw', error: err };
    }
    if (err instanceof ExchangeContractError) {
      this.logger.warn(`Contrato Exchange inválido: ${err.message}`);
      return {
        kind: 'throw',
        error: new ComparisonUnavailableException(),
      };
    }
    if (isAxiosError(err)) {
      return this.clasificarAxiosError(err, attempt);
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      return { kind: 'retry' };
    }
    return {
      kind: 'throw',
      error: new ComparisonUnavailableException(),
    };
  }

  private clasificarAxiosError(
    err: AxiosError,
    attempt: number,
  ): { kind: 'throw'; error: Error } | { kind: 'retry' } {
    const status = err.response?.status;
    if (status !== undefined) {
      const http = this.decisionHttpExchange(
        status,
        err.response?.data,
        attempt,
      );
      if (http) {
        return http;
      }
    }
    if (this.esFalloDeRed(err) && attempt < MAX_ATTEMPTS - 1) {
      return { kind: 'retry' };
    }
    return {
      kind: 'throw',
      error: new ComparisonUnavailableException(),
    };
  }

  private decisionHttpExchange(
    status: number,
    data: unknown,
    attempt: number,
  ): { kind: 'throw'; error: Error } | { kind: 'retry' } | null {
    if (status === 400) {
      return this.errorValidacionExchange(data);
    }
    if (status === 401 || status === 403) {
      this.logger.error(
        `Exchange rechazó la clave de servicio (HTTP ${status})`,
      );
      return {
        kind: 'throw',
        error: new ComparisonUnavailableException(),
      };
    }
    if (status === 429) {
      return { kind: 'throw', error: new ExchangeRateLimitedException() };
    }
    if (status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      return { kind: 'retry' };
    }
    if (status >= 500) {
      return {
        kind: 'throw',
        error: new ComparisonUnavailableException(),
      };
    }
    return null;
  }

  private errorValidacionExchange(data: unknown): {
    kind: 'throw';
    error: ExchangeValidationException;
  } {
    const errores = parseExchangeFieldErrors(data);
    if (errores) {
      return { kind: 'throw', error: new ExchangeValidationException(errores) };
    }
    return {
      kind: 'throw',
      error: new ExchangeValidationException({
        _general: 'Solicitud rechazada por Exchange',
      }),
    };
  }

  private esFalloDeRed(err: AxiosError): boolean {
    return (
      err.code === 'ECONNABORTED' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' ||
      err.message.includes('timeout') ||
      err.response === undefined
    );
  }

  private pausaReintento(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}
