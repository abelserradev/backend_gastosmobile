import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type PaymentComparison } from '@prisma/client';
import { formatYmdInCaracas } from '../common/utils/caracas-date';
import {
  EXPENSE_RESPONSE_INCLUDE,
  mapExpenseToResponse,
} from '../me/me.mappers';
import { MeService } from '../me/me.service';
import { ProfileCollaboratorService } from '../profile-collaborators/profile-collaborator.service';
import { PrismaService } from '../prisma/prisma.service';
import { ComparisonExpiredException } from './comparison-expired.exception';
import {
  buildExchangeOfferPayload,
  type CreateComparisonDto,
} from './dto/create-comparison.dto';
import type { ConvertComparisonExpenseDto } from './dto/convert-comparison-expense.dto';
import { ExchangeContractError, parseComparacionV1 } from './exchange-contract';
import { ExchangeClient } from './exchange.client';
import { mapComparisonToResponse } from './mappers/comparison.mapper';
import { mapExpenseComparisonDetail } from './mappers/expense-comparison-detail.mapper';
import {
  buildExpenseDataFromComparisonOption,
  hashConvertRequest,
} from './mappers/comparison-expense.mapper';

const COMPARISON_TTL_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_CONTRACT = 'v1';

export type ConvertComparisonExpenseResult = Readonly<{
  expense: ReturnType<typeof mapExpenseToResponse>;
  created: boolean;
}>;

@Injectable()
export class PaymentComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchange: ExchangeClient,
    private readonly me: MeService,
    private readonly profileCollaborators: ProfileCollaboratorService,
  ) {}

  /** EXP-002: snapshot guardado al convertir; 404 si el gasto no tiene comparación. */
  async getComparisonForExpense(userId: string, expenseId: string) {
    const profiles =
      await this.profileCollaborators.listProfilesForUser(userId);
    const profileIds = profiles.map((p) => p.id);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, profileId: { in: profileIds } },
      include: { comparison: true },
    });
    const comparison = expense?.comparison;
    if (!expense || !comparison) {
      throw new NotFoundException();
    }
    return mapExpenseComparisonDetail(comparison, expense);
  }

  /** GC-004 job: solo PENDING con expiresAt pasado. */
  async deleteExpiredPendingComparisons(): Promise<number> {
    const result = await this.prisma.paymentComparison.deleteMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
    });
    return result.count;
  }

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

  async convertToExpense(
    userId: string,
    comparisonId: string,
    idempotencyKey: string | undefined,
    dto: ConvertComparisonExpenseDto,
  ): Promise<ConvertComparisonExpenseResult> {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Header Idempotency-Key es obligatorio');
    }
    const requestHash = hashConvertRequest(comparisonId, dto);

    let row = await this.findOwnedOrThrow(userId, comparisonId);
    if (row.status === 'CONVERTED') {
      return this.resolveConvertedIdempotency(row, key, requestHash);
    }

    await this.purgeIfExpired(row);
    row = await this.findOwnedOrThrow(userId, comparisonId);

    const parsed = this.parseStoredResult(row);
    this.assertOptionConvertible(parsed, dto.optionId);

    const ctx = await this.me.resolveExpenseContext(userId, {
      profileId: dto.profileId,
      categoryId: dto.categoryId,
      categoryName: dto.categoryName,
    });
    const paymentDateYmd = dto.paymentDate ?? formatYmdInCaracas();
    const expenseData = buildExpenseDataFromComparisonOption({
      option: parsed.opciones.find((o) => o.id === dto.optionId)!,
      result: parsed,
      title: dto.title,
      profileId: ctx.profileId,
      categoryId: ctx.categoryId,
      referenceMonth: ctx.referenceMonth,
      paymentDateYmd,
    });

    const txResult = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.paymentComparison.updateMany({
        where: {
          id: row.id,
          userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        data: {
          status: 'CONVERTED',
          convertIdempotencyKey: key,
          convertRequestHash: requestHash,
        },
      });
      if (claim.count === 0) {
        return { raced: true as const };
      }
      const expense = await tx.expense.create({
        data: expenseData,
        include: EXPENSE_RESPONSE_INCLUDE,
      });
      await tx.paymentComparison.update({
        where: { id: row.id },
        data: { expenseId: expense.id },
      });
      return { raced: false as const, expense };
    });

    if (txResult.raced) {
      const again = await this.findOwnedOrThrow(userId, comparisonId);
      if (again.status === 'CONVERTED') {
        return this.resolveConvertedIdempotency(again, key, requestHash);
      }
      await this.purgeIfExpired(again);
      throw new ConflictException(
        'La comparación ya no está disponible para convertir',
      );
    }

    const expenseResponse = mapExpenseToResponse(txResult.expense);
    this.me.logExpenseCreatedFromComparison(
      userId,
      expenseResponse.id,
      ctx.profileId,
      {
        title: expenseResponse.title,
        amount: expenseResponse.amount,
        categoryName: expenseResponse.category,
        comparisonId: row.id,
      },
    );

    return { expense: expenseResponse, created: true };
  }

  private async resolveConvertedIdempotency(
    row: PaymentComparison,
    key: string,
    requestHash: string,
  ): Promise<ConvertComparisonExpenseResult> {
    if (!row.expenseId) {
      throw new ConflictException(
        'La comparación está convertida pero falta el gasto asociado',
      );
    }
    if (row.convertIdempotencyKey === key) {
      if (row.convertRequestHash === requestHash) {
        const expense = await this.loadExpenseForResponse(row.expenseId);
        return { expense, created: false };
      }
      throw new ConflictException({
        message:
          'Idempotency-Key reutilizada con un cuerpo distinto al original',
        expenseId: row.expenseId,
      });
    }
    throw new ConflictException({
      message: 'Esta comparación ya se convirtió en un gasto',
      expenseId: row.expenseId,
    });
  }

  private parseStoredResult(row: PaymentComparison) {
    if (row.contractVersion !== SUPPORTED_CONTRACT) {
      throw new UnprocessableEntityException(
        `Versión de contrato no soportada: ${row.contractVersion}`,
      );
    }
    try {
      return parseComparacionV1(row.result);
    } catch (err) {
      const msg =
        err instanceof ExchangeContractError
          ? err.message
          : 'Resultado de comparación inválido';
      throw new UnprocessableEntityException(msg);
    }
  }

  private assertOptionConvertible(
    parsed: ReturnType<typeof parseComparacionV1>,
    optionId: string,
  ): void {
    const option = parsed.opciones.find((o) => o.id === optionId);
    if (!option) {
      throw new UnprocessableEntityException(
        'La opción elegida no existe en esta comparación',
      );
    }
    const costo = Number(option.costoRealUsd);
    if (!Number.isFinite(costo) || costo <= 0) {
      throw new UnprocessableEntityException(
        'La opción no tiene un costo real USD válido',
      );
    }
  }

  private async loadExpenseForResponse(expenseId: string) {
    const row = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: EXPENSE_RESPONSE_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException();
    }
    return mapExpenseToResponse(row);
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

  /** GC-004: al leer o convertir una vencida, se borra y 410. */
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
