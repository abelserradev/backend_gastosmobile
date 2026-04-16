import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthCookieService } from './auth-cookie.service';
import { BCRYPT_SALT_ROUNDS } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { RegisterDto } from './dto/register.dto';
import { ResendEmailService } from '../email/resend-email.service';

export interface AuthResponseUser {
  id: string;
  email: string;
  name: string;
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

  async register(
    dto: RegisterDto,
    res: Response,
  ): Promise<AuthSessionBody> {
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
    const body = this.buildSessionPayload(user.id, email, name);
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
    let user = await this.prisma.user.findUnique({ where: { email: emailRaw } });
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
    const body = this.buildSessionPayload(user.id, emailRaw, name);
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
    const body = this.buildSessionPayload(user.id, email, displayName);
    this.cookies.setAccessJwt(res, body.token);
    return { user: body.user };
  }

  async getSessionUser(userId: string): Promise<AuthSessionBody> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      throw new UnauthorizedException();
    }
    const name = user.name?.trim() ? user.name : '';
    return {
      user: { id: user.id, email: user.email, name },
    };
  }

  clearSessionCookie(res: Response): void {
    this.cookies.clearAccessJwt(res);
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
  ): { user: AuthResponseUser; token: string } {
    const payload: JwtPayload = { sub: userId, email };
    const token = this.jwt.sign(payload);
    return {
      user: { id: userId, email, name },
      token,
    };
  }
}
