import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { ProfileCollaboratorService } from './profile-collaborator.service';
import type {
  ProfileCollaboratorResponse,
  ProfileInvitationResponse,
} from './profile-collaborator.response';

@Controller('me/invitations')
export class ProfileInvitationsController {
  constructor(
    private readonly collaboratorService: ProfileCollaboratorService,
  ) {}

  @Get()
  listInvitations(
    @CurrentUser() user: AuthUserPayload,
  ): Promise<ProfileInvitationResponse[]> {
    return this.collaboratorService.listPendingInvitations(user.userId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProfileCollaboratorResponse> {
    return this.collaboratorService.acceptInvitation(id, user.userId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectInvitation(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.collaboratorService.rejectInvitation(id, user.userId);
  }
}
