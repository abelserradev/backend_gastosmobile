import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ExchangeClient } from './exchange.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    }),
  ],
  providers: [ExchangeClient],
  exports: [ExchangeClient],
})
export class PaymentComparisonModule {}
