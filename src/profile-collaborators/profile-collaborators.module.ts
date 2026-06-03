import { Module } from '@nestjs/common';
import { ProfileCollaboratorsController } from './profile-collaborators.controller';
import { ProfileInvitationsController } from './profile-invitations.controller';
import { ProfileCollaboratorService } from './profile-collaborator.service';

@Module({
  controllers: [ProfileCollaboratorsController, ProfileInvitationsController],
  providers: [ProfileCollaboratorService],
  exports: [ProfileCollaboratorService],
})
export class ProfileCollaboratorsModule {}
