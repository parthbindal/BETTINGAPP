-- CreateIndex
CREATE INDEX "Market_status_volume24h_idx" ON "Market"("status", "volume24h");

-- CreateIndex
CREATE INDEX "Market_eventTicker_idx" ON "Market"("eventTicker");
