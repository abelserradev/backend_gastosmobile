import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MeService } from '../me/me.service';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramIntentParserService } from './telegram-intent-parser.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPendingService } from './telegram-pending.service';
import {
  buildAuthPayload,
  formatErrorMessage,
  formatExpenseCreated,
  formatHelpMessage,
  formatIncomeCreated,
  formatIncomesList,
  formatLinkSuccess,
  formatSetupRequired,
  formatSummary,
  formatUnlinkedMessage,
} from './telegram-message.formatter';
import { TelegramMutationService } from './telegram-mutation.service';
import type {
  ParsedTelegramIntent,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramPendingAction,
  TelegramUpdate,
} from './telegram.types';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly api: TelegramApiClient,
    private readonly linkService: TelegramLinkService,
    private readonly parser: TelegramIntentParserService,
    private readonly pending: TelegramPendingService,
    private readonly me: MeService,
    private readonly mutations: TelegramMutationService,
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }
    const message = update.message;
    if (!message?.text?.trim() || !message.from) {
      return;
    }
    const chatId = String(message.chat.id);
    const telegramUserId = String(message.from.id);
    const text = message.text.trim();

    const linkIntent = this.parser.parse(text, [], []);
    if (linkIntent.type === 'link' && linkIntent.linkCode) {
      await this.handleLink(chatId, telegramUserId, message, linkIntent.linkCode);
      return;
    }

    const link = await this.linkService.findActiveLinkByTelegramUserId(
      telegramUserId,
    );
    if (!link) {
      if (linkIntent.type === 'help' || /^\/start/i.test(text)) {
        await this.api.sendMessage(chatId, formatHelpMessage(this.api.getBotUsername()));
        return;
      }
      await this.api.sendMessage(chatId, formatUnlinkedMessage());
      return;
    }

    const user = buildAuthPayload(link.user.id, link.user.email);

    if (/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
      const handled = await this.mutations.tryCompletePendingAmount(
        chatId,
        user,
        text,
      );
      if (handled) {
        return;
      }
    }

    const state = await this.me.getState(user);
    const intent = this.parser.parse(
      text,
      state.categories.map((c) => c.name),
      state.incomeSources.map((s) => s.name),
    );

    if (intent.type === 'help' || /^\/start/i.test(text)) {
      await this.api.sendMessage(chatId, formatHelpMessage(this.api.getBotUsername()));
      return;
    }

    try {
      await this.dispatchIntent(chatId, user, intent, state, link.defaultProfileId);
    } catch (err: unknown) {
      const msg =
        err instanceof BadRequestException
          ? (err.message as string)
          : err instanceof Error
            ? err.message
            : 'Error desconocido';
      if (msg.includes('perfil')) {
        await this.api.sendMessage(chatId, formatSetupRequired());
        return;
      }
      this.logger.warn(`Telegram acción fallida userId=${user.userId}: ${msg}`);
      await this.api.sendMessage(chatId, formatErrorMessage(msg));
    }
  }

  private async handleLink(
    chatId: string,
    telegramUserId: string,
    message: TelegramMessage,
    code: string,
  ): Promise<void> {
    try {
      await this.linkService.linkByCode({
        code,
        telegramUserId,
        chatId,
        username: message.from?.username ?? null,
      });
      await this.api.sendMessage(chatId, formatLinkSuccess());
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo vincular la cuenta';
      await this.api.sendMessage(chatId, formatErrorMessage(msg));
    }
  }

  private async dispatchIntent(
    chatId: string,
    user: ReturnType<typeof buildAuthPayload>,
    intent: ParsedTelegramIntent,
    state: Awaited<ReturnType<MeService['getState']>>,
    defaultProfileId: string | null,
  ): Promise<void> {
    if (this.mutations.isMutationIntent(intent.type)) {
      await this.mutations.dispatchMutation(chatId, user, intent, state);
      return;
    }
    if (intent.type === 'query_summary') {
      await this.sendSummary(chatId, state);
      return;
    }
    if (intent.type === 'query_incomes') {
      await this.sendIncomes(chatId, state);
      return;
    }
    if (intent.type === 'unknown' || intent.amount == null) {
      await this.askIntentClarification(chatId, intent);
      return;
    }
    if (intent.type === 'expense') {
      const created = await this.me.createExpense(user, {
        title: intent.title ?? intent.categoryName ?? 'Gasto Telegram',
        amount: intent.amount,
        categoryName: intent.categoryName ?? 'Varios',
        profileId: defaultProfileId ?? undefined,
      });
      const fresh = await this.me.getState(user);
      const totalExp = fresh.expenses.reduce((s, e) => s + e.amount, 0);
      const budget = fresh.preferences?.effectiveMonthlyIncomeUsd ?? null;
      await this.api.sendMessage(
        chatId,
        formatExpenseCreated({
          title: created.title,
          amount: created.amount,
          categoryName: created.category,
          periodLabel: fresh.activePeriod?.label ?? 'Periodo actual',
          remainingUsd:
            budget != null ? Math.max(0, budget - totalExp) : null,
        }),
      );
      return;
    }
    if (intent.type === 'income') {
      const created = await this.me.createIncome(user, {
        title: intent.title ?? intent.sourceName ?? 'Ingreso Telegram',
        amount: intent.amount,
        sourceName: intent.sourceName ?? 'Otros',
      });
      await this.api.sendMessage(
        chatId,
        formatIncomeCreated({
          title: created.title,
          amount: created.amount,
          sourceName: created.source,
        }),
      );
      return;
    }
    await this.askIntentClarification(chatId, intent);
  }

  private async sendSummary(
    chatId: string,
    state: Awaited<ReturnType<MeService['getState']>>,
  ): Promise<void> {
    const totalExp = state.expenses.reduce((s, e) => s + e.amount, 0);
    const totalInc = state.incomes.reduce((s, i) => s + i.amount, 0);
    const budget = state.preferences?.effectiveMonthlyIncomeUsd ?? null;
    await this.api.sendMessage(
      chatId,
      formatSummary({
        periodLabel: state.activePeriod?.label ?? 'Periodo actual',
        totalExpensesUsd: totalExp,
        totalIncomesUsd: totalInc,
        budgetUsd: budget,
        remainingUsd: budget != null ? Math.max(0, budget - totalExp) : null,
      }),
    );
  }

  private async sendIncomes(
    chatId: string,
    state: Awaited<ReturnType<MeService['getState']>>,
  ): Promise<void> {
    const total = state.incomes.reduce((s, i) => s + i.amount, 0);
    await this.api.sendMessage(
      chatId,
      formatIncomesList(
        state.activePeriod?.label ?? 'Periodo actual',
        state.incomes.map((i) => ({
          title: i.title,
          amount: i.amount,
          sourceName: i.source,
        })),
        total,
      ),
    );
  }

  private async askIntentClarification(
    chatId: string,
    intent: ParsedTelegramIntent,
  ): Promise<void> {
    const pending: TelegramPendingAction = {
      rawText: intent.rawText,
      amount: intent.amount,
      categoryName: intent.categoryName,
      sourceName: intent.sourceName,
      title: intent.title,
      awaitingIntent: true,
    };
    await this.pending.save(chatId, pending);
    await this.api.sendMessage(
      chatId,
      intent.amount != null
        ? `Detecté ${intent.amount} USD pero no estoy seguro del tipo. ¿Es gasto o ingreso?`
        : 'No entendí el monto. Escribe por ejemplo: gasté 25 en comida',
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: 'Es gasto', callback_data: 'tg:intent:expense' },
              { text: 'Es ingreso', callback_data: 'tg:intent:income' },
            ],
            [{ text: 'Cancelar', callback_data: 'tg:intent:cancel' }],
          ],
        },
      },
    );
  }

  private async handleCallback(query: TelegramCallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    const telegramUserId = String(query.from.id);
    if (!chatId) {
      return;
    }
    const chatIdStr = String(chatId);
    await this.api.answerCallbackQuery(query.id);

    const data = query.data ?? '';
    if (data === 'tg:intent:cancel') {
      await this.pending.clear(chatIdStr);
      await this.api.sendMessage(chatIdStr, 'Acción cancelada.');
      return;
    }

    const link = await this.linkService.findActiveLinkByTelegramUserId(
      telegramUserId,
    );
    if (!link) {
      await this.api.sendMessage(chatIdStr, formatUnlinkedMessage());
      return;
    }
    const user = buildAuthPayload(link.user.id, link.user.email);

    if (await this.mutations.handleEntityCallback(chatIdStr, user, data)) {
      return;
    }

    const pending = await this.pending.get(chatIdStr);
    if (!pending) {
      await this.api.sendMessage(chatIdStr, 'Esta acción expiró. Escribe de nuevo.');
      return;
    }

    const state = await this.me.getState(user);
    const intentType =
      data === 'tg:intent:expense'
        ? 'expense'
        : data === 'tg:intent:income'
          ? 'income'
          : null;
    if (!intentType || pending.amount == null) {
      await this.pending.clear(chatIdStr);
      await this.api.sendMessage(
        chatIdStr,
        'Falta el monto. Ejemplo: gasté 30 en transporte',
      );
      return;
    }

    const intent: ParsedTelegramIntent = {
      type: intentType,
      amount: pending.amount,
      categoryName: pending.categoryName ?? 'Varios',
      sourceName: pending.sourceName ?? 'Otros',
      title: pending.title ?? pending.rawText,
      rawText: pending.rawText,
    };
    await this.pending.clear(chatIdStr);
    try {
      await this.dispatchIntent(
        chatIdStr,
        user,
        intent,
        state,
        link.defaultProfileId,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      await this.api.sendMessage(chatIdStr, formatErrorMessage(msg));
    }
  }
}
