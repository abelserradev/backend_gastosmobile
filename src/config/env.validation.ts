import * as Joi from 'joi';

/**
 * Falla el arranque si faltan secretos o reglas inseguras en producción.
 * Evita desplegar con JWT débil o CORS abierto sin querer.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3088),
  DATABASE_URL: Joi.string().min(1).required(),
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required().messages({
      'string.min':
        'JWT_SECRET debe tener al menos 32 caracteres en producción',
    }),
    otherwise: Joi.string().min(16).required(),
  }),
  SECRET_API_KEY: Joi.string()
    .trim()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().trim().min(32).required().messages({
        'any.required': 'SECRET_API_KEY es obligatorio en producción',
        'string.min': 'SECRET_API_KEY debe tener al menos 32 caracteres',
      }),
      otherwise: Joi.string().trim().min(16).required().messages({
        'any.required': 'SECRET_API_KEY es obligatorio (compartida con el front vía X-API-KEY)',
        'string.min': 'SECRET_API_KEY debe tener al menos 16 caracteres',
      }),
    }),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  FRONTEND_URL: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).required().messages({
        'any.required':
          'FRONTEND_URL es obligatorio en producción (CORS explícito, sin comodín)',
      }),
      otherwise: Joi.optional(),
    }),
  COOKIE_SAME_SITE: Joi.string()
    .valid('strict', 'lax', 'none')
    .lowercase()
    .default('lax'),
  // Docker/Coolify suelen definir la clave con valor "" aunque no la uses; .optional() no basta.
  COOKIE_SECURE: Joi.string().valid('true', 'false').allow('').optional(),
  DOLARAPI_BASE_URL: Joi.string().uri().allow('').optional(),
  /** JSON en una línea de la cuenta de servicio (Firebase Console → Cuenta de servicio). */
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().allow('').optional(),
  /** Resend: solo servidor; sin clave los welcome se omiten y /api/email/test responde 400. */
  RESEND_API_KEY: Joi.string().allow('').optional(),
  /** Remitente verificado en Resend, p. ej. Gastos &lt;noreply@buildforge.work&gt; */
  EMAIL_FROM: Joi.string().allow('').optional(),
  /** Ollama (glm-ocr): URL interna, p. ej. http://ollama:11434 en Docker/Coolify. */
  OLLAMA_URL: Joi.string().uri().allow('').optional(),
  OLLAMA_MODEL: Joi.string().allow('').optional(),
  OLLAMA_OCR_ENABLED: Joi.string()
    .valid('true', 'false', '0', '1', 'off', 'on')
    .optional(),
  OLLAMA_OCR_TIMEOUT_MS: Joi.number().integer().min(30_000).optional(),
  OLLAMA_OCR_WARMUP: Joi.string()
    .valid('true', 'false', '0', '1', 'off', 'on')
    .optional(),
  OLLAMA_OCR_WARMUP_TIMEOUT_MS: Joi.number().integer().min(60_000).optional(),
  OLLAMA_KEEP_ALIVE: Joi.string().allow('').optional(),
  /** Redis opcional: caché caliente BCV y cuota global Vision OCR. Sin URL → memoria del proceso. */
  REDIS_URL: Joi.string().uri().allow('').optional(),
  /** Cloud Vision OCR: activo por defecto si hay FIREBASE_SERVICE_ACCOUNT_JSON. */
  GOOGLE_VISION_ENABLED: Joi.string()
    .valid('true', 'false', '0', '1', 'off', 'on')
    .optional(),
  GOOGLE_VISION_MONTHLY_LIMIT: Joi.number().integer().min(1).max(100_000).optional(),
  GOOGLE_VISION_TIMEOUT_MS: Joi.number().integer().min(5_000).optional(),

  APP_DISTRIBUTION_PROJECT_NUMBER: Joi.string().allow('').optional(),
  APP_DISTRIBUTION_GROUP_ALIAS: Joi.string().allow('').optional(),

  TELEGRAM_ENABLED: Joi.string()
    .valid('true', 'false', '0', '1', 'off', 'on')
    .optional(),
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_BOT_USERNAME: Joi.string().allow('').optional(),
  TELEGRAM_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  TELEGRAM_WEBHOOK_URL: Joi.string().uri().allow('').optional(),
});
