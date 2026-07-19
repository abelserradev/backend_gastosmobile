import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { CacheModule } from './common/cache/cache.module';
import { GuardsModule } from './common/guards/guards.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BcvModule } from './bcv/bcv.module';
import { MeModule } from './me/me.module';
import { OcrModule } from './ocr/ocr.module';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProfileCollaboratorsModule } from './profile-collaborators/profile-collaborators.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? ['.env']
          : ['.env.development.local', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    CacheModule,
    GuardsModule,
    PrismaModule,
    AuthModule,
    MeModule,
    InventoryModule,
    ProfileCollaboratorsModule,
    BcvModule,
    OcrModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
