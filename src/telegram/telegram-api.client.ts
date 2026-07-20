import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: Record<string, unknown>;
}

/**
 * Cliente mínimo a api.telegram.org; evita dependencia extra en el MVP.
 */
@Injectable()
export class TelegramApiClient {
  private readonly logger = new Logger(TelegramApiClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const enabled = this.parseEnabled(this.config.get<string>('TELEGRAM_ENABLED'));
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    return enabled && Boolean(token);
  }

  getBotUsername(): string | null {
    const u = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim();
    return u ? u.replace(/^@/, '') : null;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      return;
    }
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (options.parseMode) {
      body.parse_mode = options.parseMode;
    }
    if (options.replyMarkup) {
      body.reply_markup = options.replyMarkup;
    }
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      this.logger.warn(`sendMessage falló (${res.status}): ${errText.slice(0, 200)}`);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      return;
    }
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  }

  async setWebhook(webhookUrl: string): Promise<boolean> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      return false;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string };
    if (!json.ok) {
      this.logger.error(`setWebhook: ${json.description ?? res.status}`);
      return false;
    }
    return true;
  }

  private parseEnabled(raw: string | undefined): boolean {
    if (!raw?.trim()) {
      return false;
    }
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'on';
  }
}
