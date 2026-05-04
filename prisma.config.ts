import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7: URL fuera del schema. `generate` no necesita BD real; si falta DATABASE_URL
 * (instalación limpia sin .env) usamos el mismo placeholder que la CI.
 */
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  'postgresql://ci:ci@127.0.0.1:5432/ci';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: databaseUrl,
  },
});
