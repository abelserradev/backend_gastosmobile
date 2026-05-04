/** Nombre de la cookie HttpOnly donde viaja el JWT (no accesible desde JS del navegador). */
export const AUTH_ACCESS_COOKIE = 'gastos_access_token';

/** Coste bcrypt: equilibrio seguridad/latencia; subir en prod si el hardware lo permite. */
export const BCRYPT_SALT_ROUNDS = 10;

/** Ventana del enlace mágico enviado por Resend (UX vs. ventana de ataque). */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
