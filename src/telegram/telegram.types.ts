/** Subconjunto del Update de Telegram Bot API usado por el webhook. */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
}

export type TelegramIntentType =
  | 'expense'
  | 'income'
  | 'query_summary'
  | 'query_incomes'
  | 'help'
  | 'link'
  | 'unknown';

export interface ParsedTelegramIntent {
  type: TelegramIntentType;
  amount?: number;
  categoryName?: string;
  sourceName?: string;
  title?: string;
  rawText: string;
  linkCode?: string;
}

export interface TelegramPendingAction {
  rawText: string;
  amount?: number;
  categoryName?: string;
  sourceName?: string;
  title?: string;
  awaitingIntent?: boolean;
}
