import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

/** GC-001 / REQ-008: Exchange caído o contrato inválido. */
export class ComparisonUnavailableException extends ServiceUnavailableException {
  constructor(detail?: string) {
    super({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'COMPARISON_UNAVAILABLE',
      message:
        detail ??
        'El servicio de comparación no está disponible; inténtalo más tarde',
    });
  }
}

export class ExchangeValidationException extends BadRequestException {
  constructor(errores: Record<string, string>) {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Datos de comparación inválidos',
      errores,
    });
  }
}

export class ExchangeRateLimitedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Demasiadas comparaciones; espera un momento',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
