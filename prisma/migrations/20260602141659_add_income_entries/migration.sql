-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(14,2) NOT NULL,
    "referenceMonth" DATE NOT NULL,
    "receivedDate" DATE,
    "bcvRateApplied" DECIMAL(14,6),
    "bcvRateDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeSource_userId_idx" ON "IncomeSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSource_userId_name_key" ON "IncomeSource"("userId", "name");

-- CreateIndex
CREATE INDEX "IncomeEntry_userId_referenceMonth_idx" ON "IncomeEntry"("userId", "referenceMonth");

-- CreateIndex
CREATE INDEX "IncomeEntry_sourceId_idx" ON "IncomeEntry"("sourceId");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
