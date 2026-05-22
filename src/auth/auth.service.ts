import {
  BadRequestException,
  ConflictException,
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
  BCRYPT_SALT_ROUNDS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
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
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo');
    }
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
    void this.resendEmail
      .sendWelcomeEmail(email, name)
      .catch((err: unknown) =>
        this.logger.warn(`Welcome email: ${String(err)}`),
      );
    return { user: body.user };
  }

  async loginWithFirebase(
    idToken: string,
    res: Response,
  ): Promise<AuthSessionBody> {
    let decoded;
    try {
      decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Token de Firebase inválido o expirado');
    }
    const emailRaw = decoded.email?.trim().toLowerCase();
    if (!emailRaw || decoded.email_verified !== true) {
      throw new UnauthorizedException(
        'Google no devolvió un correo verificado',
      );
    }
    const nameFromToken =
      typeof decoded.name === 'string' ? decoded.name.trim() : '';
    const fallbackName = emailRaw.split('@')[0] ?? 'Usuario';
    const displayName = nameFromToken || fallbackName;
    let user = await this.prisma.user.findUnique({
      where: { email: emailRaw },
    });
    let createdWithFirebase = false;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: emailRaw,
          passwordHash: null,
          name: displayName,
        },
      });
      createdWithFirebase = true;
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
      void this.resendEmail
        .sendWelcomeEmail(emailRaw, displayName)
        .catch((err: unknown) =>
          this.logger.warn(`Welcome email (Firebase): ${String(err)}`),
        );
    }
    return { user: body.user };
  }

  async login(dto: LoginDto, res: Response): Promise<AuthSessionBody> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const hashForCompare = user?.passwordHash ?? this.getTimingDummyHash();
    const passwordOk = await bcrypt.compare(dto.password, hashForCompare);
    if (!user?.passwordHash || !passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const displayName = user.name?.trim() ? user.name : '';
    const body = this.buildSessionPayload(user.id, email, displayName, true);
    this.cookies.setAccessJwt(res, body.token);
    return { user: body.user };
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
    const user = await this.prisma.user.findUnique({ where: { email } });
    const genericOk = { ok: true as const };
    if (!user) {
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
      const modo = wantsReset ? 'reset' : 'crear-clave';
      this.logger.warn(`Sin RESEND_API_KEY — ${modo} ${email}: ${resetUrl}`);
      return genericOk;
    }
    try {
      if (wantsReset) {
        await this.resendEmail.sendPasswordResetEmail(email, resetUrl);
      } else {
        await this.resendEmail.sendPasswordCreationEmail(email, resetUrl);
      }
    } catch (err: unknown) {
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
    this.cookies.clearAccessJwt(res);
  }

  private hashPasswordResetToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
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
