-- CreateTable
CREATE TABLE "WhaleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradersScanned" INTEGER NOT NULL DEFAULT 0,
    "positionsScanned" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WhaleSnapshot_generatedAt_idx" ON "WhaleSnapshot"("generatedAt");
