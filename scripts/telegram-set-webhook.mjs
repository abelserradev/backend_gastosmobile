#!/usr/bin/env node
/**
 * Registra el webhook de Telegram en producción.
 * Uso: node scripts/telegram-set-webhook.mjs
 * Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_URL en el entorno.
 */
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();

if (!token || !webhookUrl) {
  console.error('Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_WEBHOOK_URL');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
});
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
process.exit(json.ok ? 0 : 1);
