import type { CollaboratorRole, CollaboratorStatus } from '@prisma/client';

export interface ProfileCollaboratorResponse {
  id: string;
  profileId: string;
  profileName: string;
  userId: string;
  userEmail: string;
  userName: string;
  invitedById: string;
  status: CollaboratorStatus;
  role: CollaboratorRole;
  createdAt: string;
  acceptedAt: string | null;
}

export interface ProfileInvitationResponse {
  id: string;
  profileId: string;
  profileName: string;
  invitedByName: string;
  role: CollaboratorRole;
  createdAt: string;
}

export interface UserProfileListItemResponse {
  id: string;
  name: string;
  type: string;
  access: 'owner' | 'collaborator';
  ownerName?: string | null;
}
