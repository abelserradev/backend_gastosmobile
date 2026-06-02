import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'OPTIONS') {
      return true;
    }
    const expected = (this.config.get<string>('SECRET_API_KEY') ?? '').trim();
    if (!expected) {
      throw new UnauthorizedException('API key no configurada en el servidor');
    }
    const raw = req.headers[API_KEY_HEADER];
    let provided = '';
    if (typeof raw === 'string') {
      provided = raw.trim();
    } else if (Array.isArray(raw)) {
      provided = String(raw[0] ?? '').trim();
    }
    if (!provided) {
      throw new UnauthorizedException('Falta X-API-KEY');
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      throw new UnauthorizedException('X-API-KEY inválida');
    }
    if (!timingSafeEqual(a, b)) {
      throw new UnauthorizedException('X-API-KEY inválida');
    }
    return true;
  }
}
