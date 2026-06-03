import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfileOwnerGuard } from '../common/guards/profile-owner.guard';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { InviteProfileCollaboratorDto } from './dto/invite-profile-collaborator.dto';
import { ProfileCollaboratorService } from './profile-collaborator.service';
import type { ProfileCollaboratorResponse } from './profile-collaborator.response';

@Controller('me/profiles/:profileId/collaborators')
@UseGuards(ProfileOwnerGuard)
export class ProfileCollaboratorsController {
  constructor(
    private readonly collaboratorService: ProfileCollaboratorService,
  ) {}

  @Get()
  listCollaborators(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<ProfileCollaboratorResponse[]> {
    return this.collaboratorService.listByProfile(profileId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  inviteCollaborator(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: InviteProfileCollaboratorDto,
  ): Promise<ProfileCollaboratorResponse> {
    return this.collaboratorService.invite(profileId, user.userId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeCollaborator(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('userId', ParseUUIDPipe) collaboratorUserId: string,
  ): Promise<void> {
    await this.collaboratorService.revoke(
      profileId,
      user.userId,
      collaboratorUserId,
    );
  }
}
