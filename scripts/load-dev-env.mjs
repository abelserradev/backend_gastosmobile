import { config } from 'dotenv';
import { existsSync } from 'node:fs';

/** Prioriza .env.development.local (gitignored) sobre .env para scripts locales. */
export function loadDevEnv() {  config();
  if (existsSync('.env.development.local')) {
    config({ path: '.env.development.local', override: true });
  }
}
