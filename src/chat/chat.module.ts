import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatKnowledgeService } from './chat-knowledge.service';
import { ChatFallbackService } from './chat-fallback.service';
import { ChatProfileContextService } from './chat-profile-context.service';
import { ChatSessionStore } from './chat-session.store';
import { OllamaChatClient } from './ollama-chat.client';
import { PromptGuardService } from './prompt-guard.service';

@Module({
  imports: [PrismaModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatKnowledgeService,
    ChatFallbackService,
    ChatProfileContextService,
    ChatSessionStore,
    OllamaChatClient,
    PromptGuardService,
  ],
})
export class ChatModule {}
