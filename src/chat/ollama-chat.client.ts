import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class OllamaChatClient {
  private readonly logger = new Logger(OllamaChatClient.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = (this.config.get<string>('CHAT_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') {
      return false;
    }
    return this.resolveBaseUrl().length > 0;
  }

  async ping(): Promise<boolean> {
    const base = this.resolveBaseUrl();
    if (!base) {
      return false;
    }
    try {
      const resp = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: OllamaChatMessage[]): Promise<string> {
    const base = this.resolveBaseUrl();
    const model = this.getChatModel();
    const timeoutMs = this.getTimeoutMs();
    const resp = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Ollama chat HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { message?: { content?: string } };
    const content = data.message?.content?.trim();
    if (!content) {
      throw new Error('Respuesta vacía de Ollama');
    }
    return content;
  }

  private resolveBaseUrl(): string {
    const configured = (this.config.get<string>('OLLAMA_URL') ?? '').trim();
    if (configured.includes('localhost') || configured.includes('127.0.0.1')) {
      this.logger.debug('OLLAMA_URL localhost en Docker → http://ollama:11434');
      return 'http://ollama:11434';
    }
    return configured || 'http://ollama:11434';
  }

  private getChatModel(): string {
    return (
      this.config.get<string>('CHAT_OLLAMA_MODEL')?.trim() ||
      this.config.get<string>('OLLAMA_CHAT_MODEL')?.trim() ||
      'llama3.2'
    );
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('CHAT_OLLAMA_TIMEOUT_MS'));
    return Number.isFinite(n) && n >= 15_000 ? n : 90_000;
  }
}
