export type TelegramAmountCurrency = 'USD' | 'BS';

export type TelegramEntityKind = 'expense' | 'income' | 'inventory';

export type TelegramIntentType =
  | 'expense'
  | 'income'
  | 'query_summary'
  | 'query_incomes'
  | 'query_expenses'
  | 'query_inventory'
  | 'delete_expense'
  | 'delete_income'
  | 'delete_inventory'
  | 'update_expense'
  | 'update_income'
  | 'update_inventory'
  | 'help'
  | 'link'
  | 'unknown';

export interface ParsedTelegramIntent {
  type: TelegramIntentType;
  amount?: number;
  /** Moneda explícita del monto; si falta, el bot usa defaultCurrency del usuario. */
  amountCurrency?: TelegramAmountCurrency;
  /** Monto nuevo en comandos de actualización (ej. "cambiar gasto comida a 30"). */
  newAmount?: number;
  newAmountCurrency?: TelegramAmountCurrency;
  categoryName?: string;
  sourceName?: string;
  title?: string;
  /** Texto libre para ubicar el registro (título, categoría, nombre producto). */
  searchQuery?: string;
  rawText: string;
  linkCode?: string;
}

export interface TelegramEntityPick {
  kind: TelegramEntityKind;
  id: string;
  profileId?: string;
  label: string;
}

export interface TelegramPendingAction {
  rawText: string;
  amount?: number;
  amountCurrency?: TelegramAmountCurrency;
  categoryName?: string;
  sourceName?: string;
  title?: string;
  awaitingIntent?: boolean;
  /** Tras elegir de una lista, guardamos el id real (callback usa prefijo corto). */
  picks?: TelegramEntityPick[];
  pendingUpdate?: {
    kind: TelegramEntityKind;
    id: string;
    profileId?: string;
    newAmount?: number;
    newAmountCurrency?: TelegramAmountCurrency;
    newTitle?: string;
    categoryName?: string;
    sourceName?: string;
    salePrice?: number;
  };
}

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
