# Bot de Telegram (Spend$ave)

Integración MVP: registrar gastos/ingresos en lenguaje natural y consultar resumen del periodo activo.

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `TELEGRAM_ENABLED` | `true` para procesar updates |
| `TELEGRAM_BOT_TOKEN` | Token de [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_BOT_USERNAME` | Usuario del bot sin `@` (deep link en la web) |
| `TELEGRAM_WEBHOOK_SECRET` | Segmento secreto en la URL del webhook |
| `TELEGRAM_WEBHOOK_URL` | URL HTTPS completa del webhook (producción) |

Ejemplo producción:

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_BOT_USERNAME=SpendSaveBot
TELEGRAM_WEBHOOK_SECRET=un-secreto-largo-aleatorio
TELEGRAM_WEBHOOK_URL=https://api-gastos.buildforge.work/api/telegram/webhook/un-secreto-largo-aleatorio
```

## Vincular cuenta

1. En la app web: **Conectar Telegram** → código de 6 dígitos (10 min).
2. En Telegram: `/vincular CODIGO` o abrir el deep link `t.me/TuBot?start=CODIGO`.

## Desarrollo local (sin HTTPS)

1. Backend con `TELEGRAM_ENABLED=true` y secret configurado.
2. En otra terminal:

```bash
node scripts/telegram-poll.mjs
```

Alternativa: túnel ngrok hacia `POST /api/telegram/webhook/:secret` y `node scripts/telegram-set-webhook.mjs`.

## Producción (Coolify)

Tras desplegar el backend:

```bash
node scripts/telegram-set-webhook.mjs
```

## Ejemplos de mensajes

- `gasté 25 en comida almuerzo`
- `recibí 800 de freelance`
- `cuánto llevo gastado este mes`
- `mis ingresos`
- `/ayuda`

## Endpoints API

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/api/telegram/webhook/:secret` | Público (secret en path) |
| POST | `/api/me/telegram/link-code` | JWT |
| GET | `/api/me/telegram/status` | JWT |
| DELETE | `/api/me/telegram/link` | JWT |
