import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { CacheService } from '../common/cache/cache.service';
import { extractAuditContext } from '../audit/request-context.util';
import { AuthService, AuthSessionBody } from './auth.service';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { UnlockAccountRequestDto } from './dto/unlock-account-request.dto';
import { UnlockAccountVerifyDto } from './dto/unlock-account-verify.dto';
import {
  APP_VERSION,
  EXPENSE_REFERENCE_FILTER_ID,
} from '../common/constants/deploy-capabilities.const';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cache: CacheService,
  ) {}

  /** Valida la cookie JWT y devuelve el usuario (rehidratar UI sin token en localStorage). */
  @Get('me')
  sessionUser(@CurrentUser() user: AuthUserPayload): Promise<AuthSessionBody> {
    return this.auth.getSessionUser(user.userId);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<AuthSessionBody> {
    return this.auth.register(dto, res, extractAuditContext(req));
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<AuthSessionBody> {
    return this.auth.login(dto, res, extractAuditContext(req));
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('firebase')
  loginFirebase(
    @Body() dto: FirebaseLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<AuthSessionBody> {
    return this.auth.loginWithFirebase(
      dto.idToken,
      res,
      extractAuditContext(req),
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    return this.auth.requestPasswordReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('unlock/request')
  requestAccountUnlock(
    @Body() dto: UnlockAccountRequestDto,
  ): Promise<{ ok: true }> {
    return this.auth.requestAccountUnlock(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('unlock/verify')
  verifyAccountUnlock(
    @Body() dto: UnlockAccountVerifyDto,
  ): Promise<{ ok: true }> {
    return this.auth.verifyAccountUnlock(dto);
  }

  /** Contraseña inicial tras Google (cookie JWT); no usar @Public: solo usuario autenticado sin hash previo. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('password/setup')
  setupPassword(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SetupPasswordDto,
  ): Promise<AuthSessionBody> {
    return this.auth.setupPassword(user.userId, dto);
  }

  /** Limpia la cookie HttpOnly en el navegador del cliente. */
  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: boolean } {
    this.auth.clearSessionCookie(res);
    return { ok: true };
  }

  /** Smoke check; requiere X-API-KEY (Coolify/probes sin JWT).
   * Incluye estado de Redis: up, down o disabled (sin REDIS_URL).
   */
  @Public()
  @SkipThrottle()
  @Get('health')
  async health(): Promise<{
    ok: boolean;
    redis: 'up' | 'down' | 'disabled';
    version: string;
    expenseReferenceFilter: typeof EXPENSE_REFERENCE_FILTER_ID;
  }> {
    const version = process.env.APP_VERSION ?? APP_VERSION;
    const base = {
      ok: true as const,
      version,
      expenseReferenceFilter: EXPENSE_REFERENCE_FILTER_ID,
    };
    if (!this.cache.isUsingRedis()) {
      return { ...base, redis: 'disabled' };
    }
    const redisUp = await this.cache.ping();
    return { ...base, redis: redisUp ? 'up' : 'down' };
  }
}
