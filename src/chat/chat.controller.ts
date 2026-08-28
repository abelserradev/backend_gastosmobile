import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('config')
  obtenerConfig(
    @CurrentUser() user: AuthUserPayload,
    @Query('profileId') profileId?: string,
  ) {
    return this.chat.obtenerConfig(user.userId, profileId?.trim() || undefined);
  }

  @Public()
  @Get('health')
  health() {
    return this.chat.health();
  }

  @Post('message')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async message(
    @CurrentUser() user: AuthUserPayload,
    @Body() body: ChatMessageDto,
  ) {
    return this.chat.procesarMensaje(
      user.userId,
      body.sessionId,
      body.message.trim(),
      body.profileId?.trim() || undefined,
    );
  }
}
