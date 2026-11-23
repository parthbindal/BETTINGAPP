-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "followAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smartAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smartMaxRank" INTEGER NOT NULL DEFAULT 250,
ADD COLUMN     "smartMinUsd" INTEGER NOT NULL DEFAULT 25000,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramLinkToken" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3),
ADD COLUMN     "telegramUsername" TEXT;

-- CreateTable
CREATE TABLE "SmartAlert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "traderName" TEXT NOT NULL,
    "rank" INTEGER,
    "side" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "eventSlug" TEXT,
    "marketSlug" TEXT,
    "category" TEXT NOT NULL,
    "usd" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "fills" JSONB NOT NULL,
    "firstTradeAt" TIMESTAMP(3) NOT NULL,
    "lastTradeAt" TIMESTAMP(3) NOT NULL,
    "channelPostedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartAlertDelivery" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmartAlert_key_key" ON "SmartAlert"("key");

-- CreateIndex
CREATE INDEX "SmartAlert_lastTradeAt_idx" ON "SmartAlert"("lastTradeAt");

-- CreateIndex
CREATE INDEX "SmartAlert_createdAt_idx" ON "SmartAlert"("createdAt");

-- CreateIndex
CREATE INDEX "SmartAlert_wallet_lastTradeAt_idx" ON "SmartAlert"("wallet", "lastTradeAt");

-- CreateIndex
CREATE INDEX "SmartAlertDelivery_userId_createdAt_idx" ON "SmartAlertDelivery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmartAlertDelivery_alertId_userId_channel_key" ON "SmartAlertDelivery"("alertId", "userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_telegramChatId_key" ON "NotificationPreference"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_telegramLinkToken_key" ON "NotificationPreference"("telegramLinkToken");

-- AddForeignKey
ALTER TABLE "SmartAlertDelivery" ADD CONSTRAINT "SmartAlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SmartAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartAlertDelivery" ADD CONSTRAINT "SmartAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

