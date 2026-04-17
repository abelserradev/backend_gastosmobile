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

## Docker (producción)

**Stack completo (Postgres 16 + API)** en `docker-compose.yml` y `Dockerfile`. Plantilla de variables:

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
