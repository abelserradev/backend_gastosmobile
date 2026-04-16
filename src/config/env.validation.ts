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
      'string.min': 'JWT_SECRET debe tener al menos 32 caracteres en producción',
    }),
    otherwise: Joi.string().min(16).required(),
  }),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  FRONTEND_URL: Joi.string().allow('').when('NODE_ENV', {
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
  COOKIE_SECURE: Joi.string().valid('true', 'false').optional(),
  DOLARAPI_BASE_URL: Joi.string().uri().optional(),
  /** JSON en una línea de la cuenta de servicio (Firebase Console → Cuenta de servicio). */
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional(),
  /** Resend: solo servidor; sin clave los welcome se omiten y /api/email/test responde 400. */
  RESEND_API_KEY: Joi.string().allow('').optional(),
  /** Remitente verificado en Resend, p. ej. Gastos &lt;noreply@buildforge.work&gt; */
  EMAIL_FROM: Joi.string().allow('').optional(),
});
