-- CreateTable
CREATE TABLE "JobRun" (
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "note" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("name")
);

