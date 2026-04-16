import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AUTH_ACCESS_COOKIE } from './auth.constants';
import { jwtExpiresToMaxAgeMs } from './auth-cookie.util';

interface CookieShape {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

/**
 * Encapsula flags de cookie (DRY entre set/clear) y reglas secure/sameSite.
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService) {}

  setAccessJwt(res: Response, jwt: string): void {
    const base = this.baseShape();
    res.cookie(AUTH_ACCESS_COOKIE, jwt, {
      ...base,
      maxAge: jwtExpiresToMaxAgeMs(
        this.config.get<string>('JWT_EXPIRES_IN') ?? '7d',
      ),
    });
  }

  clearAccessJwt(res: Response): void {
    const base = this.baseShape();
    res.clearCookie(AUTH_ACCESS_COOKIE, {
      path: base.path,
      httpOnly: base.httpOnly,
      secure: base.secure,
      sameSite: base.sameSite,
    });
  }

  private baseShape(): CookieShape {
    const { sameSite, secure } = this.resolveSameSiteAndSecure();
    return {
      path: '/',
      httpOnly: true,
      secure,
      sameSite,
    };
  }

  private resolveSameSiteAndSecure(): {
    sameSite: 'strict' | 'lax' | 'none';
    secure: boolean;
  } {
    const raw = (this.config.get<string>('COOKIE_SAME_SITE') ?? 'lax').toLowerCase();
    const sameSite = ['strict', 'lax', 'none'].includes(raw)
      ? (raw as 'strict' | 'lax' | 'none')
      : 'lax';
    const forceSecure = this.config.get<string>('COOKIE_SECURE') === 'true';
    const prod = this.config.get<string>('NODE_ENV') === 'production';
    const secure = forceSecure || prod || sameSite === 'none';
    return { sameSite, secure };
  }
}
