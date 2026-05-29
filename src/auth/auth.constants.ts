/** Nombre de la cookie HttpOnly donde viaja el JWT (no accesible desde JS del navegador). */
export const AUTH_ACCESS_COOKIE = 'gastos_access_token';

/** Coste bcrypt: equilibrio seguridad/latencia; subir en prod si el hardware lo permite. */
export const BCRYPT_SALT_ROUNDS = 10;

/** Ventana del enlace mágico enviado por Resend (UX vs. ventana de ataque). */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Tras este número de logins fallidos con contraseña, la cuenta queda bloqueada. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 4;

/** Validez del código OTP enviado por correo para desbloquear. */
export const ACCOUNT_UNLOCK_CODE_TTL_MS = 15 * 60 * 1000;

/** Intentos de adivinar el código antes de invalidarlo. */
export const MAX_UNLOCK_CODE_ATTEMPTS = 5;

export const AUTH_ERROR_ACCOUNT_LOCKED = 'ACCOUNT_LOCKED';
