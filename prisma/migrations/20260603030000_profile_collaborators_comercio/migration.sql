-- FEAT-003: Colaboradores en perfiles comercio

CREATE TYPE "CollaboratorStatus" AS ENUM ('pending', 'accepted', 'rejected', 'revoked');
CREATE TYPE "CollaboratorRole" AS ENUM ('editor', 'viewer');

CREATE TABLE "ProfileCollaborator" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "CollaboratorStatus" NOT NULL DEFAULT 'pending',
    "role" "CollaboratorRole" NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileCollaborator_profileId_userId_key" ON "ProfileCollaborator"("profileId", "userId");
CREATE INDEX "ProfileCollaborator_userId_status_idx" ON "ProfileCollaborator"("userId", "status");
CREATE INDEX "ProfileCollaborator_profileId_status_idx" ON "ProfileCollaborator"("profileId", "status");

ALTER TABLE "ProfileCollaborator" ADD CONSTRAINT "ProfileCollaborator_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileCollaborator" ADD CONSTRAINT "ProfileCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileCollaborator" ADD CONSTRAINT "ProfileCollaborator_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
