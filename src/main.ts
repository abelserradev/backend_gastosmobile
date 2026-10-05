import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { resolveCorsOrigin } from './common/bootstrap/cors-options';

/**
 * Asigna un requestId único por petición si el cliente no envía x-request-id.
 * El id se usa para correlacionar logs del servidor con filas de auditoría.
 */
function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers['x-request-id'];
  req.headers['x-request-id'] =
    typeof header === 'string' && header.trim().length > 0
      ? header.trim()
      : randomUUID();
  next();
}

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
  app.use(requestIdMiddleware);
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
