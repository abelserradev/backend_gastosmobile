-- Bloqueo por intentos fallidos de login + códigos OTP de desbloqueo
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE TABLE "AccountUnlockCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountUnlockCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountUnlockCode_codeHash_key" ON "AccountUnlockCode"("codeHash");
CREATE INDEX "AccountUnlockCode_userId_idx" ON "AccountUnlockCode"("userId");

ALTER TABLE "AccountUnlockCode" ADD CONSTRAINT "AccountUnlockCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
