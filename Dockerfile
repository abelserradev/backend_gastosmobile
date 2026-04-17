# Producción: multi-stage. bcrypt compila en Alpine (musl) con toolchain en builder.
FROM node:22.12.0-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma/
# Coolify suele pasar NODE_ENV=production al build; sin --include=dev no hay Nest/TS para compilar.
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.12.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

USER node

EXPOSE 3088

# prisma está en dependencies; migrate deploy antes de arrancar Nest.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
