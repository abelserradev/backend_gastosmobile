import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPaymentComparisonEnabled } from '../payment-comparison.config';

/** GC-001: con flag apagado, /api/me/comparisons* responde 404. */
@Injectable()
export class PaymentComparisonEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isPaymentComparisonEnabled(this.config)) {
      throw new NotFoundException();
    }
    return true;
  }
}
