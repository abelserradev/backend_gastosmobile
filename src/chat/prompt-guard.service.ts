import { Injectable } from '@nestjs/common';

/** Patrones típicos de jailbreak / extracción de system prompt (ES + EN). */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /ignora\s+(todas?\s+)?(las\s+)?instrucciones/i,
  /olvida\s+(tus\s+)?(reglas|instrucciones)/i,
  /(you are now|act as|pretend to be|roleplay as)/i,
  /(eres ahora|actúa como|finge ser|simula ser)/i,
  /(system prompt|prompt del sistema|instrucciones del sistema)/i,
  /(reveal|show|print|dump|mostrar|revela)\s+(the\s+)?(system|hidden|secret)/i,
  /(jailbreak|DAN mode|developer mode|modo desarrollador)/i,
  /```\s*system/i,
  /\brole\s*:\s*system\b/i,
  /(bypass|override|sin restricciones|without restrictions)/i,
  /(api[_-]?key|jwt[_-]?secret|database_url|contraseña del servidor)/i,
];

const SECRET_LEAK_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /\b(sk-[a-zA-Z0-9]{20,})\b/,
  /\b(AIza[0-9A-Za-z\-_]{30,})\b/,
  /\b(postgresql:\/\/[^\s]+)/i,
  /\b(mongodb(\+srv)?:\/\/[^\s]+)/i,
];

const BLOCKED_USER_REPLY =
  'Solo puedo ayudarte a usar Spend$ave (gastos, ingresos e inventario). Reformula tu pregunta sobre la app.';

const MAX_OUTPUT_CHARS = 1200;

@Injectable()
export class PromptGuardService {
  evaluarEntrada(mensaje: string): { allowed: boolean; reason?: string } {
    const normalizado = mensaje.trim();
    if (!normalizado) {
      return { allowed: false, reason: 'empty' };
    }
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(normalizado)) {
        return { allowed: false, reason: 'injection_pattern' };
      }
    }
    const ratioNuevo = (normalizado.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) ?? [])
      .length;
    if (ratioNuevo > 3) {
      return { allowed: false, reason: 'control_chars' };
    }
    return { allowed: true };
  }

  sanitizarSalida(texto: string): string {
    let out = texto.trim();
    for (const pattern of SECRET_LEAK_PATTERNS) {
      out = out.replace(pattern, '[redactado]');
    }
    if (out.length > MAX_OUTPUT_CHARS) {
      out = `${out.slice(0, MAX_OUTPUT_CHARS).trim()}…`;
    }
    return out;
  }

  respuestaBloqueada(): string {
    return BLOCKED_USER_REPLY;
  }
}
