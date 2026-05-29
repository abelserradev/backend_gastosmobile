-- OcrCorrectionSample: feedback post-OCR (mobile gastos v1.3, FEAT-OCR-FB)

CREATE TABLE "OcrCorrectionSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT,
    "source" TEXT NOT NULL,
    "submissionVariant" TEXT,
    "documentKindGuess" TEXT,
    "parseSnapshot" JSONB NOT NULL,
    "corrected" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrCorrectionSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OcrCorrectionSample_userId_createdAt_idx" ON "OcrCorrectionSample"("userId", "createdAt");

CREATE INDEX "OcrCorrectionSample_expenseId_idx" ON "OcrCorrectionSample"("expenseId");

ALTER TABLE "OcrCorrectionSample" ADD CONSTRAINT "OcrCorrectionSample_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OcrCorrectionSample" ADD CONSTRAINT "OcrCorrectionSample_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
