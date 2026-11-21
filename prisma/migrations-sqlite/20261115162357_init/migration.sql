-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" DATETIME,
    "dateOfBirth" DATETIME,
    "region" TEXT,
    "acceptedTermsAt" DATETIME,
    "responsibleUseAckAt" DATETIME,
    "referralCode" TEXT,
    "referredById" TEXT,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "experienceLevel" TEXT
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'none',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "grantedById" TEXT,
    "grantNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "payload" JSONB,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "eventTicker" TEXT NOT NULL PRIMARY KEY,
    "seriesTicker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subTitle" TEXT,
    "category" TEXT NOT NULL,
    "mutuallyExclusive" BOOLEAN NOT NULL DEFAULT false,
    "settlementSources" JSONB,
    "source" TEXT NOT NULL DEFAULT 'kalshi',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Market" (
    "ticker" TEXT NOT NULL PRIMARY KEY,
    "eventTicker" TEXT NOT NULL,
    "seriesTicker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "yesSubTitle" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "yesBid" REAL,
    "yesAsk" REAL,
    "lastPrice" REAL,
    "previousPrice" REAL,
    "volume" REAL NOT NULL DEFAULT 0,
    "volume24h" REAL NOT NULL DEFAULT 0,
    "openInterest" REAL NOT NULL DEFAULT 0,
    "openTime" DATETIME,
    "closeTime" DATETIME,
    "expirationTime" DATETIME,
    "rulesPrimary" TEXT,
    "rulesSecondary" TEXT,
    "result" TEXT,
    "source" TEXT NOT NULL DEFAULT 'kalshi',
    "freshness" TEXT NOT NULL DEFAULT 'live',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Market_eventTicker_fkey" FOREIGN KEY ("eventTicker") REFERENCES "MarketEvent" ("eventTicker") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "yesBid" REAL,
    "yesAsk" REAL,
    "lastPrice" REAL,
    "volume" REAL,
    "openInterest" REAL,
    CONSTRAINT "MarketSnapshot_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Market" ("ticker") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "estimate" REAL NOT NULL,
    "marketProb" REAL NOT NULL,
    "confidence" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelEstimate_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Market" ("ticker") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sport" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "conference" TEXT,
    "division" TEXT,
    "pace" REAL,
    "defRating" REAL,
    "offRating" REAL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sport" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "jersey" TEXT,
    "injuryStatus" TEXT,
    "injuryNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sport" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "venue" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'demo',
    CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerGameLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "isHome" BOOLEAN NOT NULL,
    "opponentId" TEXT NOT NULL,
    "minutes" REAL NOT NULL,
    "stats" JSONB NOT NULL,
    CONSTRAINT "PlayerGameLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerGameLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Projection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stat" TEXT NOT NULL,
    "line" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Projection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Projection_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meta" JSONB,
    "alertConfig" JSONB,
    "lastValue" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT,
    "refId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "side" TEXT,
    "predictedProb" REAL NOT NULL,
    "marketProb" REAL,
    "modelProb" REAL,
    "modelVersion" TEXT,
    "confidence" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvesAt" DATETIME,
    "outcome" BOOLEAN,
    "resolvedAt" DATETIME,
    "resolutionSource" TEXT,
    "lockedAt" DATETIME,
    CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "sources" JSONB,
    "mode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "dataQuality" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseSlug" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseSlug" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "marketMoves" BOOLEAN NOT NULL DEFAULT true,
    "moveThresholdPts" INTEGER NOT NULL DEFAULT 5,
    "projectionUpdates" BOOLEAN NOT NULL DEFAULT true,
    "news" BOOLEAN NOT NULL DEFAULT false,
    "upcomingEvents" BOOLEAN NOT NULL DEFAULT true,
    "dataAvailability" BOOLEAN NOT NULL DEFAULT true,
    "emailDigest" TEXT NOT NULL DEFAULT 'weekly',
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunityThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    CONSTRAINT "CommunityVote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunityThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "rewardedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSequenceState" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "step" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" DATETIME,
    "lastSentAt" DATETIME,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EmailSequenceState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastSuccessAt" DATETIME,
    "lastErrorAt" DATETIME,
    "lastError" TEXT,
    "latencyMs" INTEGER,
    "callsToday" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeatureLimitOverride" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlatformUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "user_referralCode_key" ON "user"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_stripeEventId_key" ON "BillingEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "MarketEvent_category_idx" ON "MarketEvent"("category");

-- CreateIndex
CREATE INDEX "Market_category_status_idx" ON "Market"("category", "status");

-- CreateIndex
CREATE INDEX "Market_volume_idx" ON "Market"("volume");

-- CreateIndex
CREATE INDEX "Market_closeTime_idx" ON "Market"("closeTime");

-- CreateIndex
CREATE INDEX "MarketSnapshot_ticker_ts_idx" ON "MarketSnapshot"("ticker", "ts");

-- CreateIndex
CREATE INDEX "ModelEstimate_ticker_createdAt_idx" ON "ModelEstimate"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "Player_sport_teamId_idx" ON "Player"("sport", "teamId");

-- CreateIndex
CREATE INDEX "Game_sport_startsAt_idx" ON "Game"("sport", "startsAt");

-- CreateIndex
CREATE INDEX "PlayerGameLog_playerId_date_idx" ON "PlayerGameLog"("playerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameLog_playerId_gameId_key" ON "PlayerGameLog"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "Projection_gameId_idx" ON "Projection"("gameId");

-- CreateIndex
CREATE INDEX "Projection_playerId_stat_idx" ON "Projection"("playerId", "stat");

-- CreateIndex
CREATE INDEX "WatchlistItem_kind_refId_idx" ON "WatchlistItem"("kind", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_kind_refId_key" ON "WatchlistItem"("userId", "kind", "refId");

-- CreateIndex
CREATE INDEX "Prediction_userId_domain_idx" ON "Prediction"("userId", "domain");

-- CreateIndex
CREATE INDEX "Prediction_refId_idx" ON "Prediction"("refId");

-- CreateIndex
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchReport_userId_createdAt_idx" ON "ResearchReport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_courseSlug_lessonSlug_key" ON "LessonProgress"("userId", "courseSlug", "lessonSlug");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_courseSlug_idx" ON "QuizAttempt"("userId", "courseSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_key_key" ON "Achievement"("userId", "key");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityThread_kind_createdAt_idx" ON "CommunityThread"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_threadId_createdAt_idx" ON "CommunityPost"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityVote_threadId_userId_key" ON "CommunityVote"("threadId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "EmailLog_userId_createdAt_idx" ON "EmailLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_feature_createdAt_idx" ON "UsageEvent"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_scope_createdAt_idx" ON "ErrorLog"("scope", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_kind_dateKey_key" ON "Brief"("kind", "dateKey");

-- CreateIndex
CREATE INDEX "PlatformUpdate_publishedAt_idx" ON "PlatformUpdate"("publishedAt");
