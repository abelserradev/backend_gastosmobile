import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { GastosThrottlerStorage } from './gastos-throttler.storage';

@Global()
@Module({
  providers: [CacheService, GastosThrottlerStorage],
  exports: [CacheService, GastosThrottlerStorage],
})
export class CacheModule {}
