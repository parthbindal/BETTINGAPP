-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventSlug" TEXT,
    "marketSlug" TEXT,
    "endDate" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryHolders" INTEGER NOT NULL,
    "entryValue" DOUBLE PRECISION NOT NULL,
    "entryKind" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPrice" DOUBLE PRECISION NOT NULL,
    "peakHolders" INTEGER NOT NULL,
    "peakValue" DOUBLE PRECISION NOT NULL,
    "scans" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "settlePrice" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signal_tokenId_key" ON "Signal"("tokenId");

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_firstSeenAt_idx" ON "Signal"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Signal_conditionId_idx" ON "Signal"("conditionId");

-- CreateIndex
CREATE INDEX "Signal_entryKind_status_idx" ON "Signal"("entryKind", "status");
