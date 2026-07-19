#!/usr/bin/env node
/**
 * Polling local sin HTTPS: reenvía updates al webhook del backend en localhost.
 * Uso:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-poll.mjs
 * Opcional: TELEGRAM_POLL_BACKEND=http://localhost:3088/api/telegram/webhook/SECRET
 */
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const backendBase =
  process.env.TELEGRAM_POLL_BACKEND?.trim() ??
  (secret
    ? `http://localhost:${process.env.PORT ?? 3088}/api/telegram/webhook/${secret}`
    : '');

if (!token || !backendBase) {
  console.error(
    'Configura TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET (o TELEGRAM_POLL_BACKEND)',
  );
  process.exit(1);
}

await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ drop_pending_updates: false }),
});

let offset = 0;
console.error(`Polling → ${backendBase}`);

for (;;) {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`,
  );
  const json = (await res.json()) as {
    ok?: boolean;
    result?: { update_id: number }[];
  };
  if (!json.ok || !json.result?.length) {
    continue;
  }
  for (const update of json.result) {
    offset = update.update_id + 1;
    await fetch(backendBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }
}
