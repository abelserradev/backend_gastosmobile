-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paidByMemberId" TEXT;

-- CreateTable
CREATE TABLE "ProfileMember" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileMember_profileId_idx" ON "ProfileMember"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileMember_profileId_displayName_key" ON "ProfileMember"("profileId", "displayName");

-- CreateIndex
CREATE INDEX "Expense_paidByMemberId_idx" ON "Expense"("paidByMemberId");

-- AddForeignKey
ALTER TABLE "ProfileMember" ADD CONSTRAINT "ProfileMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidByMemberId_fkey" FOREIGN KEY ("paidByMemberId") REFERENCES "ProfileMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
