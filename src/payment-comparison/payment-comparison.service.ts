import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PaymentComparison } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ComparisonExpiredException } from './comparison-expired.exception';
import { ExchangeClient } from './exchange.client';
import {
  buildExchangeOfferPayload,
  type CreateComparisonDto,
} from './dto/create-comparison.dto';
import { mapComparisonToResponse } from './mappers/comparison.mapper';

const COMPARISON_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PaymentComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchange: ExchangeClient,
  ) {}

  async create(userId: string, dto: CreateComparisonDto) {
    const offer = buildExchangeOfferPayload(dto);
    const result = await this.exchange.postComparacion(userId, offer);
    const bestOptionId = result.mejores[0];
    if (!bestOptionId) {
      throw new BadRequestException(
        'Exchange no devolvió una opción recomendada',
      );
    }

    const computedAt = new Date(result.computedAt);
    const expiresAt = new Date(Date.now() + COMPARISON_TTL_MS);
    const row = await this.prisma.paymentComparison.create({
      data: {
        userId,
        status: 'PENDING',
        productName: result.producto ?? dto.producto?.trim() ?? null,
        offer: offer as Prisma.InputJsonValue,
        result,
        contractVersion: result.version,
        bestOptionId,
        computedAt,
        expiresAt,
      },
    });
    return mapComparisonToResponse(row);
  }

  async listPending(userId: string) {
    const now = new Date();
    const rows = await this.prisma.paymentComparison.findMany({
      where: {
        userId,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapComparisonToResponse);
  }

  async getById(userId: string, comparisonId: string) {
    const row = await this.findOwnedOrThrow(userId, comparisonId);
    await this.purgeIfExpired(row);
    return mapComparisonToResponse(row);
  }

  async discard(userId: string, comparisonId: string) {
    const row = await this.findOwnedOrThrow(userId, comparisonId);
    if (row.status !== 'PENDING') {
      throw new NotFoundException();
    }
    await this.prisma.paymentComparison.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  private async findOwnedOrThrow(
    userId: string,
    comparisonId: string,
  ): Promise<PaymentComparison> {
    const row = await this.prisma.paymentComparison.findFirst({
      where: { id: comparisonId, userId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /** GC-004: al leer una vencida, se borra y 410. */
  private async purgeIfExpired(row: PaymentComparison): Promise<void> {
    if (row.status !== 'PENDING') {
      return;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.paymentComparison.delete({ where: { id: row.id } });
      throw new ComparisonExpiredException();
    }
  }
}
