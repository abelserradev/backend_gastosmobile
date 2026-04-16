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

## Docker (Postgres + API en desarrollo)

**Postgres + API en tu máquina:** usa `docker-compose.dev.yml` (no mezclar con el `docker-compose.yml` mínimo que usa Coolify). Copia la plantilla y define secretos solo en `backend/.env.docker.local` (gitignored):

```bash
cp env.docker.local.example .env.docker.local
```

Desde la **raíz del repositorio**:

```bash
docker compose --env-file backend/.env.docker.local up -d --build
```

Desde **solo** la carpeta `backend/`:

```bash
docker compose --env-file .env.docker.local -f docker-compose.dev.yml up -d --build
```

**Producción / Coolify:** `docker-compose.yml` solo declara el servicio `backend` con `Dockerfile` (sin Postgres).

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
