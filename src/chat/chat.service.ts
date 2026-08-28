import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatMessageResponseDto } from './dto/chat-message.dto';
import { ChatFallbackService } from './chat-fallback.service';
import { ChatKnowledgeService } from './chat-knowledge.service';
import { ChatProfileContextService } from './chat-profile-context.service';
import { ChatSessionStore } from './chat-session.store';
import { OllamaChatClient } from './ollama-chat.client';
import { PromptGuardService } from './prompt-guard.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly knowledge: ChatKnowledgeService,
    private readonly guard: PromptGuardService,
    private readonly ollama: OllamaChatClient,
    private readonly fallback: ChatFallbackService,
    private readonly sessions: ChatSessionStore,
    private readonly profileContext: ChatProfileContextService,
  ) {}

  async obtenerConfig(userId: string, profileId?: string) {
    const contexto = await this.profileContext.resolverContexto(
      userId,
      profileId,
    );
    return {
      brandName: 'Spend$ave',
      disclaimer: this.knowledge.disclaimerPublico(),
      suggestions: this.knowledge.sugerenciasIniciales(contexto),
      profileContext: contexto,
    };
  }

  async health(): Promise<{ ollama: 'ok' | 'unavailable'; chatEnabled: boolean }> {
    const enabled = this.ollama.isEnabled();
    if (!enabled) {
      return { ollama: 'unavailable', chatEnabled: false };
    }
    const ok = await this.ollama.ping();
    return { ollama: ok ? 'ok' : 'unavailable', chatEnabled: true };
  }

  async procesarMensaje(
    userId: string,
    sessionId: string | undefined,
    mensaje: string,
    profileId?: string,
  ): Promise<ChatMessageResponseDto> {
    const evaluacion = this.guard.evaluarEntrada(mensaje);
    const sid = sessionId?.trim() || randomUUID();
    const contexto = await this.profileContext.resolverContexto(
      userId,
      profileId,
    );

    if (!evaluacion.allowed) {
      this.logger.warn(
        `Chat bloqueado userId=${userId} reason=${evaluacion.reason ?? 'unknown'}`,
      );
      return {
        sessionId: sid,
        reply: this.guard.respuestaBloqueada(),
        blocked: true,
        ollamaAvailable: await this.ollama.ping(),
      };
    }

    this.sessions.appendMessage(userId, sid, 'user', mensaje);
    const historial = this.sessions.getMessages(userId, sid);

    const ollamaOk = this.ollama.isEnabled() && (await this.ollama.ping());
    let reply: string;

    if (!ollamaOk) {
      reply = this.fallback.construirRespuesta(mensaje, contexto);
    } else {
      try {
        const systemPrompt = this.knowledge.construirSystemPrompt(contexto);
        const messages = [
          { role: 'system' as const, content: systemPrompt },
          ...historial.map((h) => ({
            role: h.role,
            content: h.content,
          })),
        ];
        const raw = await this.ollama.chat(messages);
        reply = this.guard.sanitizarSalida(raw);
        const reeval = this.guard.evaluarEntrada(reply);
        if (!reeval.allowed) {
          reply = this.guard.respuestaBloqueada();
        }
      } catch (err) {
        this.logger.warn(
          `Ollama chat falló: ${err instanceof Error ? err.message : err}`,
        );
        reply = this.fallback.construirRespuesta(mensaje, contexto);
      }
    }

    this.sessions.appendMessage(userId, sid, 'assistant', reply);

    return {
      sessionId: sid,
      reply,
      blocked: false,
      ollamaAvailable: ollamaOk,
    };
  }
}
