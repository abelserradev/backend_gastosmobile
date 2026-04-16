# bcrypt compila código nativo en Alpine: toolchain solo en builder.
# Evitamos `npm ci --omit=dev` en la imagen final (recompilaría bcrypt sin gcc y falla en Coolify).
FROM node:22.12.0-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.12.0-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

EXPOSE 3088

USER node

CMD ["node", "dist/main.js"]
