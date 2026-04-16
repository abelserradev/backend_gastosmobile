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

El archivo `docker-compose.yml` **no** incluye usuarios ni contraseñas por defecto. Copia la plantilla y define secretos solo en `backend/.env.docker.local` (gitignored):

```bash
cp env.docker.local.example .env.docker.local
```

Desde la **raíz del repositorio**:

```bash
docker compose --env-file backend/.env.docker.local up -d --build
```

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
