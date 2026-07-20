import { createHash, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60 * 1000;

export interface TelegramLinkCodeResponse {
  code: string;
  expiresAt: string;
  botUsername: string | null;
  deepLink: string | null;
}

export interface TelegramLinkStatusResponse {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
}

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createLinkCode(userId: string): Promise<TelegramLinkCodeResponse> {
    const code = String(randomInt(100_000, 999_999));
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.telegramLinkToken.deleteMany({ where: { userId } });
    await this.prisma.telegramLinkToken.create({
      data: { userId, codeHash, expiresAt },
    });

    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim()
      ?.replace(/^@/, '') ?? null;
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=${code}`
      : null;

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername,
      deepLink,
    };
  }

  async getStatus(userId: string): Promise<TelegramLinkStatusResponse> {
    const link = await this.prisma.telegramLink.findUnique({
      where: { userId },
    });
    if (!link || !link.isActive) {
      return { linked: false, username: null, linkedAt: null };
    }
    return {
      linked: true,
      username: link.username,
      linkedAt: link.linkedAt.toISOString(),
    };
  }

  async unlink(userId: string): Promise<{ ok: true }> {
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
    await this.prisma.telegramLinkToken.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async linkByCode(input: {
    code: string;
    telegramUserId: string;
    chatId: string;
    username?: string | null;
  }): Promise<{ userId: string; email: string | null }> {
    const codeHash = this.hashCode(input.code.trim());
    const token = await this.prisma.telegramLinkToken.findFirst({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!token) {
      throw new BadRequestException('Código inválido o expirado');
    }

    const existingTelegram = await this.prisma.telegramLink.findUnique({
      where: { telegramUserId: input.telegramUserId },
    });
    if (existingTelegram && existingTelegram.userId !== token.userId) {
      throw new ConflictException(
        'Esta cuenta de Telegram ya está vinculada a otro usuario',
      );
    }

    await this.prisma.$transaction([
      this.prisma.telegramLinkToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.telegramLinkToken.deleteMany({
        where: { userId: token.userId, usedAt: null },
      }),
      this.prisma.telegramLink.upsert({
        where: { userId: token.userId },
        create: {
          userId: token.userId,
          telegramUserId: input.telegramUserId,
          chatId: input.chatId,
          username: input.username ?? null,
        },
        update: {
          telegramUserId: input.telegramUserId,
          chatId: input.chatId,
          username: input.username ?? null,
          isActive: true,
          linkedAt: new Date(),
        },
      }),
    ]);

    return { userId: token.user.id, email: token.user.email };
  }

  async findActiveLinkByTelegramUserId(telegramUserId: string) {
    return this.prisma.telegramLink.findFirst({
      where: { telegramUserId, isActive: true },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async findActiveLinkByChatId(chatId: string) {
    return this.prisma.telegramLink.findFirst({
      where: { chatId, isActive: true },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  private hashCode(code: string): string {
    const pepper =
      this.config.get<string>('SECRET_API_KEY')?.trim() ?? 'dev-pepper';
    return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
  }
}
