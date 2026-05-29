/**
 * En logs de producción no volcamos el correo completo; basta pista para rastrear soporte.
 */
export function enmascararCorreo(correo: string): string {
  const c = correo.trim().toLowerCase();
  const arroba = c.indexOf('@');
  if (arroba <= 0) {
    return '***';
  }
  const local = c.slice(0, arroba);
  const dominio = c.slice(arroba);
  if (local.length <= 2) {
    return `**${dominio}`;
  }
  return `${local[0]}***${local.at(-1)}${dominio}`;
}
