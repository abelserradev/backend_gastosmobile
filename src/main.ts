import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { resolveCorsOrigin } from './common/bootstrap/cors-options';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      ...(isProd
        ? { hsts: { maxAge: 31_536_000, includeSubDomains: true } }
        : {}),
    }),
  );
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: resolveCorsOrigin(process.env.FRONTEND_URL),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-KEY',
      'x-api-key',
      'x-gastos-client',
    ],
  });
  const port = Number.parseInt(process.env.PORT ?? '3088', 10);
  await app.listen(port);
}
void bootstrap();
