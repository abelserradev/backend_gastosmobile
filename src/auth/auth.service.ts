import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthCookieService } from './auth-cookie.service';
import {
  ACCOUNT_UNLOCK_CODE_TTL_MS,
  AUTH_ERROR_ACCOUNT_LOCKED,
  BCRYPT_SALT_ROUNDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  MAX_UNLOCK_CODE_ATTEMPTS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { UnlockAccountRequestDto } from './dto/unlock-account-request.dto';
import { UnlockAccountVerifyDto } from './dto/unlock-account-verify.dto';
import { enmascararCorreo } from '../common/utils/mask-correo-for-log.util';
import { ResendEmailService } from '../email/resend-email.service';

export interface AuthResponseUser {
  id: string;
  email: string;
  name: string;
  /** Permite entrar por email/clave además de Google; si false hay que definir contraseña (Google u onboarding). */
  hasPassword: boolean;
}

export interface AuthSessionBody {
  user: AuthResponseUser;
}

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Hash de relleno: bcrypt.compare siempre corre aunque el usuario no exista (menos filtrado por tiempo). */
  private timingDummyHash: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cookies: AuthCookieService,
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly resendEmail: ResendEmailService,
  ) {}

  async register(dto: RegisterDto, res: Response): Promise<AuthSessionBody> {
    const email = dto.email.trim().toLowerCase();
    const correoLog = enmascararCorreo(email);
    this.logger.log(`[Registro] Llegó pedido de alta para ${correoLog}`);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.logger.warn(`[Registro] Frenamos: ya hay cuenta con ${correoLog}`);
      throw new ConflictException('Ya existe una cuenta con este correo');
    }
    this.logger.log(`[Registro] Creando usuario en BD para ${correoLog}`);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const name = dto.name.trim();
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
      },
    });
    const body = this.buildSessionPayload(user.id, email, name, true);
    this.cookies.setAccessJwt(res, body.token);
    this.logger.log(
      `[Registro] Listo: sesión montada (userId=${user.id}), mandando bienvenida en segundo plano`,
    );
    void this.resendEmail
      .sendWelcomeEmail(email, name)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Registro] El correo de bienvenida se fue en la olla: ${String(err)}`,
        ),
      );
    return { user: body.user };
  }

  async loginWithFirebase(
    idToken: string,
    res: Response,
  ): Promise<AuthSessionBody> {
    this.logger.log('[Ingreso Google] Validando token con Firebase…');
    let decoded;
    try {
      decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Token de Firebase inválido o expirado');
    }
    const emailRaw = decoded.email?.trim().toLowerCase();
    if (!emailRaw || decoded.email_verified !== true) {
      this.logger.warn(
        '[Ingreso Google] Google no mandó correo verificado, no seguimos',
      );
      throw new UnauthorizedException(
        'Google no devolvió un correo verificado',
      );
    }
    const correoLog = enmascararCorreo(emailRaw);
    this.logger.log(`[Ingreso Google] Token OK para ${correoLog}`);
    const nameFromToken =
      typeof decoded.name === 'string' ? decoded.name.trim() : '';
    const fallbackName = emailRaw.split('@')[0] ?? 'Usuario';
    const displayName = nameFromToken || fallbackName;
    let user = await this.prisma.user.findUnique({
      where: { email: emailRaw },
    });
    let createdWithFirebase = false;
    if (!user) {
      this.logger.log(
        `[Ingreso Google] Primera vez con ${correoLog}, creando cuenta`,
      );
      user = await this.prisma.user.create({
        data: {
          email: emailRaw,
          passwordHash: null,
          name: displayName,
        },
      });
      createdWithFirebase = true;
    } else if (user.lockedAt) {
      this.logger.warn(`[Ingreso Google] Cuenta bloqueada: ${correoLog}`);
      throw this.buildAccountLockedException();
    } else if (!user.name?.trim() && displayName) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name: displayName },
      });
    }
    const name = user.name?.trim() ? user.name : '';
    const hasPassword = Boolean(user.passwordHash);
    const body = this.buildSessionPayload(user.id, emailRaw, name, hasPassword);
    this.cookies.setAccessJwt(res, body.token);
    if (createdWithFirebase) {
      this.logger.log(
        `[Ingreso Google] Sesión lista; bienvenida en segundo plano pa' ${correoLog}`,
      );
      void this.resendEmail
        .sendWelcomeEmail(emailRaw, displayName)
        .catch((err: unknown) =>
          this.logger.warn(`[Ingreso Google] Bienvenida falló: ${String(err)}`),
        );
    } else {
      this.logger.log(`[Ingreso Google] Todo fino, volvió ${correoLog}`);
    }
    return { user: body.user };
  }

  async login(dto: LoginDto, res: Response): Promise<AuthSessionBody> {
    const email = dto.email.trim().toLowerCase();
    const correoLog = enmascararCorreo(email);
    this.logger.log(`[Ingreso] Intento con correo/clave para ${correoLog}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.lockedAt) {
      this.logger.warn(`[Ingreso] Cuenta bloqueada: ${correoLog}`);
      throw this.buildAccountLockedException();
    }
    const hashForCompare = user?.passwordHash ?? this.getTimingDummyHash();
    const passwordOk = await bcrypt.compare(dto.password, hashForCompare);
    if (!user?.passwordHash || !passwordOk) {
      if (user?.passwordHash) {
        const justLocked = await this.recordFailedPasswordLogin(user.id);
        if (justLocked) {
          this.logger.warn(
            `[Ingreso] Se bloqueó la cuenta por intentos: ${correoLog}`,
          );
          throw this.buildAccountLockedException();
        }
        this.logger.warn(`[Ingreso] Clave incorrecta para ${correoLog}`);
      } else {
        this.logger.warn(
          `[Ingreso] No hay cuenta o no tiene clave: ${correoLog}`,
        );
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0 },
      });
    }
    const displayName = user.name?.trim() ? user.name : '';
    const body = this.buildSessionPayload(user.id, email, displayName, true);
    this.cookies.setAccessJwt(res, body.token);
    this.logger.log(`[Ingreso] Todo fino, sesión montada para ${correoLog}`);
    return { user: body.user };
  }

  /** Envía OTP por correo si la cuenta existe, tiene clave y está bloqueada. */
  async requestAccountUnlock(
    dto: UnlockAccountRequestDto,
  ): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const correoLog = enmascararCorreo(email);
    this.logger.log(`[Desbloqueo] Pedido de código OTP para ${correoLog}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const genericOk = { ok: true as const };
    if (!user?.passwordHash || !user.lockedAt) {
      this.logger.log(
        `[Desbloqueo] Respuesta genérica (sin envío real) pa' ${correoLog}`,
      );
      return genericOk;
    }
    await this.prisma.accountUnlockCode.deleteMany({
      where: { userId: user.id },
    });
    const rawCode = crypto.randomInt(100_000, 1_000_000).toString();
    const codeHash = this.hashUnlockCode(rawCode);
    const expiresAt = new Date(Date.now() + ACCOUNT_UNLOCK_CODE_TTL_MS);
    await this.prisma.accountUnlockCode.create({
      data: { userId: user.id, codeHash, expiresAt },
    });
    if (!this.resendEmail.isConfigured()) {
      this.logger.warn(
        `[Desbloqueo] Sin RESEND — código en log dev ${correoLog}: ${rawCode}`,
      );
      return genericOk;
    }
    try {
      await this.resendEmail.sendAccountUnlockCodeEmail(email, rawCode);
      this.logger.log(`[Desbloqueo] Código mandado por correo a ${correoLog}`);
    } catch (err: unknown) {
      this.logger.warn(
        `[Desbloqueo] No se pudo mandar el correo a ${correoLog}: ${String(err)}`,
      );
      await this.prisma.accountUnlockCode.deleteMany({
        where: { userId: user.id },
      });
      throw err;
    }
    return genericOk;
  }

  async verifyAccountUnlock(
    dto: UnlockAccountVerifyDto,
  ): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.lockedAt) {
      throw new BadRequestException(
        'La cuenta no está bloqueada o el correo no es válido.',
      );
    }
    const row = await this.prisma.accountUnlockCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    if (!row || row.expiresAt.getTime() <= now) {
      throw new BadRequestException('Código inválido o expirado.');
    }
    const codeHash = this.hashUnlockCode(dto.code.trim());
    if (row.codeHash !== codeHash) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_UNLOCK_CODE_ATTEMPTS) {
        await this.prisma.accountUnlockCode.delete({ where: { id: row.id } });
      } else {
        await this.prisma.accountUnlockCode.update({
          where: { id: row.id },
          data: { attempts },
        });
      }
      throw new BadRequestException('Código inválido o expirado.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedAt: null },
      }),
      this.prisma.accountUnlockCode.deleteMany({ where: { userId: user.id } }),
    ]);
    return { ok: true };
  }

  async getSessionUser(userId: string): Promise<AuthSessionBody> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      throw new UnauthorizedException();
    }
    const name = user.name?.trim() ? user.name : '';
    const hasPassword = Boolean(user.passwordHash);
    return {
      user: { id: user.id, email: user.email, name, hasPassword },
    };
  }

  /**
   * Correo con enlace mágico: restablecer si ya hay clave; crear acceso por correo si la cuenta es solo Google.
   */
  async requestPasswordReset(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const correoLog = enmascararCorreo(email);
    this.logger.log(`[Recuperar clave] Pedido para ${correoLog}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const genericOk = { ok: true as const };
    if (!user) {
      this.logger.log(
        `[Recuperar clave] Respuesta genérica (correo no registrado) ${correoLog}`,
      );
      return genericOk;
    }
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
    const resetUrl = this.resendEmail.buildPasswordResetUrl(rawToken);
    const wantsReset = Boolean(user.passwordHash);
    if (!this.resendEmail.isConfigured()) {
      const modo = wantsReset ? 'restablecer' : 'crear-clave';
      this.logger.warn(
        `[Recuperar clave] Sin RESEND — enlace ${modo} en log dev ${correoLog}`,
      );
      return genericOk;
    }
    try {
      if (wantsReset) {
        this.logger.log(
          `[Recuperar clave] Mandando enlace de restablecer a ${correoLog}`,
        );
        await this.resendEmail.sendPasswordResetEmail(email, resetUrl);
      } else {
        this.logger.log(
          `[Recuperar clave] Mandando enlace crear clave (solo Google) a ${correoLog}`,
        );
        await this.resendEmail.sendPasswordCreationEmail(email, resetUrl);
      }
      this.logger.log(`[Recuperar clave] Correo salió fino pa' ${correoLog}`);
    } catch (err: unknown) {
      this.logger.warn(
        `[Recuperar clave] Falló el envío a ${correoLog}: ${String(err)}`,
      );
      await this.prisma.passwordResetToken.delete({ where: { tokenHash } });
      throw err;
    }
    return genericOk;
  }

  /** Consume token: nueva contraseña o primera contraseña si antes solo había Google. */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const tokenHash = this.hashPasswordResetToken(dto.token.trim());
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = Date.now();
    if (!row || row.expiresAt.getTime() <= now || !row.user.email) {
      throw new BadRequestException(
        'El enlace no es válido o expiró; solicitá uno nuevo.',
      );
    }
    const prevHash = row.user.passwordHash;
    if (prevHash) {
      const sameAsBefore = await bcrypt.compare(dto.password, prevHash);
      if (sameAsBefore) {
        throw new BadRequestException(
          'La nueva contraseña debe ser distinta a la anterior.',
        );
      }
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: row.user.id },
      }),
    ]);
    return { ok: true };
  }

  /** Primera contraseña tras Google (sesión activa); si ya hay hash, error explícito. */
  async setupPassword(
    userId: string,
    dto: SetupPasswordDto,
  ): Promise<AuthSessionBody> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      throw new UnauthorizedException();
    }
    if (user.passwordHash) {
      throw new BadRequestException(
        'Ya tenés contraseña; para cambiarla usá el flujo de recuperación por correo.',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return this.getSessionUser(userId);
  }

  clearSessionCookie(res: Response): void {
    this.logger.log('[Ingreso] Cerró sesión (cookie limpiada)');
    this.cookies.clearAccessJwt(res);
  }

  private hashPasswordResetToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  private hashUnlockCode(rawCode: string): string {
    return crypto.createHash('sha256').update(rawCode, 'utf8').digest('hex');
  }

  private buildAccountLockedException(): ForbiddenException {
    return new ForbiddenException({
      message:
        'Cuenta bloqueada por intentos fallidos. Solicita un código de verificación por correo.',
      code: AUTH_ERROR_ACCOUNT_LOCKED,
    });
  }

  /** Incrementa contador; devuelve true si acaba de bloquearse en este intento. */
  private async recordFailedPasswordLogin(userId: string): Promise<boolean> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    if (updated.failedLoginAttempts < MAX_FAILED_LOGIN_ATTEMPTS) {
      return false;
    }
    if (!updated.lockedAt) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedAt: new Date() },
      });
    }
    return true;
  }

  private getTimingDummyHash(): string {
    if (!this.timingDummyHash) {
      this.timingDummyHash = bcrypt.hashSync(
        '__auth_absent_user__',
        BCRYPT_SALT_ROUNDS,
      );
    }
    return this.timingDummyHash;
  }

  private buildSessionPayload(
    userId: string,
    email: string,
    name: string,
    hasPassword: boolean,
  ): { user: AuthResponseUser; token: string } {
    const payload: JwtPayload = { sub: userId, email };
    const token = this.jwt.sign(payload);
    return {
      user: { id: userId, email, name, hasPassword },
      token,
    };
  }
}
