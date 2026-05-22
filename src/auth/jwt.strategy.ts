import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_ACCESS_COOKIE } from './auth.constants';
import type { AuthUserPayload } from '../common/types/auth-user.payload';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const jar = req.cookies as Partial<Record<string, string>>;
          const cookieValue = jar[AUTH_ACCESS_COOKIE];
          return typeof cookieValue === 'string' ? cookieValue : null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUserPayload {
    return { userId: payload.sub, email: payload.email };
  }
}
