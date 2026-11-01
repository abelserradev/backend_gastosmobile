import { GoneException } from '@nestjs/common';

/** GC-004: comparación PENDING pasada de expiresAt. */
export class ComparisonExpiredException extends GoneException {
  constructor() {
    super({
      statusCode: 410,
      code: 'COMPARISON_EXPIRED',
      message: 'La comparación venció; vuelve a cargar el precio',
    });
  }
}
