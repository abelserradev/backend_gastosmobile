import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeClient } from './exchange.client';
import { PaymentComparisonController } from './payment-comparison.controller';
import { PaymentComparisonEnabledGuard } from './guards/payment-comparison-enabled.guard';
import { PaymentComparisonService } from './payment-comparison.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    }),
  ],
  controllers: [PaymentComparisonController],
  providers: [
    ExchangeClient,
    PaymentComparisonService,
    PaymentComparisonEnabledGuard,
  ],
  exports: [PaymentComparisonService, ExchangeClient],
})
export class PaymentComparisonModule {}
