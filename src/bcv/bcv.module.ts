import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BcvController } from './bcv.controller';
import { BcvRateService } from './bcv-rate.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>(
          'DOLARAPI_BASE_URL',
          'https://ve.dolarapi.com',
        ),
        timeout: 15_000,
        headers: { Accept: 'application/json' },
      }),
    }),
  ],
  controllers: [BcvController],
  providers: [BcvRateService],
  exports: [BcvRateService],
})
export class BcvModule {}
