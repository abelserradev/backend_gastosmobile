import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { AuthService, AuthSessionBody } from './auth.service';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  ): Promise<AuthSessionBody> {
    return this.auth.register(dto, res);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionBody> {
    return this.auth.login(dto, res);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('firebase')
  loginFirebase(
    @Body() dto: FirebaseLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionBody> {
    return this.auth.loginWithFirebase(dto.idToken, res);
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

  /** Smoke check de ruta pública (útil en despliegues). */
  @Public()
  @SkipThrottle()
  @Get('health')
  health(): { ok: boolean } {
    return { ok: true };
  }
}
