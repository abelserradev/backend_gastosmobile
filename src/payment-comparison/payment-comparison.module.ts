import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '../common/cache/cache.module';
import { MeModule } from '../me/me.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileCollaboratorsModule } from '../profile-collaborators/profile-collaborators.module';
import { ComparisonCleanupJob } from './comparison-cleanup.job';
import { ExchangeClient } from './exchange.client';
import { ExpenseComparisonController } from './expense-comparison.controller';
import { PaymentComparisonController } from './payment-comparison.controller';
import { PaymentComparisonEnabledGuard } from './guards/payment-comparison-enabled.guard';
import { PaymentComparisonService } from './payment-comparison.service';

@Module({
  imports: [
    MeModule,
    CacheModule,
    ProfileCollaboratorsModule,
    PrismaModule,
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    }),
  ],
  controllers: [PaymentComparisonController, ExpenseComparisonController],
  providers: [
    ExchangeClient,
    PaymentComparisonService,
    PaymentComparisonEnabledGuard,
    ComparisonCleanupJob,
  ],
  exports: [PaymentComparisonService, ExchangeClient],
})
export class PaymentComparisonModule {}
