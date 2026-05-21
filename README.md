# Backend

API NestJS del proyecto `Gastos`.

## Scripts útiles

```bash
npm install
npm run start:dev
npm run build
npm run start:prod
npx prisma migrate deploy
```

## OCR híbrido (Tesseract + glm-ocr)

El endpoint `POST /api/ocr/parse-invoice` ejecuta **Tesseract.js** y, si Ollama está disponible, **glm-ocr** en paralelo y fusiona campos (misma lógica que el servicio Python histórico).

| Variable | Default | Uso |
|----------|---------|-----|
| `OLLAMA_URL` | `http://localhost:11434` | URL del servidor Ollama |
| `OLLAMA_MODEL` | `glm-ocr` | Modelo en [Ollama](https://ollama.com/library/glm-ocr) |
| `OLLAMA_OCR_ENABLED` | `true` | `false` → solo Tesseract |
| `OLLAMA_OCR_TIMEOUT_MS` | `120000` | Timeout inferencia VLM |

**Host local (sin Docker):** `ollama serve` + `ollama pull glm-ocr`, luego `OLLAMA_URL=http://localhost:11434` en `.env`.

**Docker local (Postgres + Ollama + API):**

```bash
cp .env.docker.local.example .env.docker.local
docker compose -f docker-compose.local.yml --env-file .env.docker.local up -d --build
```

Si Ollama ya corre en el host: `docker compose -f docker-compose.local.yml -f docker-compose.host-ollama.yml up -d postgres backend`.

**Coolify:** `docker-compose.yml` incluye `ollama` + job `ollama-pull` en la red `coolify`.

**Si ves `fetch failed` y `glm=0 chars`:**

1. En variables de entorno del backend en Coolify, **no** uses `OLLAMA_URL=http://localhost:11434` (desde Docker eso apunta al propio contenedor Nest). Usa `http://ollama:11434` o el hostname interno del servicio Ollama.
2. Tras redeploy, en logs de arranque debe aparecer `Ollama OK en http://ollama:11434` o un aviso explícito de conexión.
3. Ollama y backend deben estar en el **mismo** despliegue Compose o en la misma red Docker con DNS interno.

Si Ollama es **recurso aparte** en Coolify: `OLLAMA_URL=http://<hostname-interno-coolify>:11434` y quita `ollama` / `ollama-pull` del compose del backend.

## Docker (producción)

**Stack API (+ Ollama en compose)** en `docker-compose.yml` y `Dockerfile`. Plantilla de variables:

```bash
cp .env.production.example .env.production
```

Desde `backend/`:

```bash
docker compose --env-file .env.production up -d --build
```

Desde la **raíz del monorepo** (el `docker-compose.yml` raíz incluye `backend/docker-compose.yml`):

```bash
docker compose --env-file backend/.env.production up -d --build
```

**Coolify** (base directory `backend/`, Docker Compose): las variables del panel deben aparecer en el YAML como `${NOMBRE}`. Si Postgres es un recurso aparte en Coolify, quita el servicio `postgres` y `depends_on` del backend en `docker-compose.yml` y usa `DATABASE_URL` interna; revisa `docs/despliegue-coolify-cloudflare.md`.

## Variables mínimas

Crea `backend/.env` a partir de `backend/.env.example`.

Variables clave:

- `PORT`
- `FRONTEND_URL`
- `DATABASE_URL`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

## Salud del servicio

La comprobación más útil en despliegue es:

```bash
curl -i http://localhost:3088/api/auth/health
```

## Despliegue con Coolify

La guía completa para desplegar este backend con Cloudflare y Coolify está en:

- `docs/despliegue-coolify-cloudflare.md`

## Notas operativas

- En producción el backend debe permitir `FRONTEND_URL=https://mobilegastos.buildforge.work`.
- Si Prisma devuelve `P1001`, el problema suele ser conectividad con PostgreSQL o una `DATABASE_URL` incorrecta.
- Para validar CORS real, prueba `OPTIONS /api/auth/register` con `Origin: https://mobilegastos.buildforge.work`.
