-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MODERATOR', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "UserStat" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoomStat" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('RESTRICTED', 'OPEN_WITH_CODE');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PARTICIPANT', 'MODERATOR');

-- CreateEnum
CREATE TYPE "RoundStat" AS ENUM ('PENDING', 'OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImportStat" AS ENUM ('PENDING', 'PREVIEWED', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "UserStat" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectTitle" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "joinCode" TEXT NOT NULL,
    "joinCodeExpiresAt" TIMESTAMP(3),
    "joinCodeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "accessMode" "AccessMode" NOT NULL DEFAULT 'RESTRICTED',
    "status" "RoomStat" NOT NULL DEFAULT 'DRAFT',
    "settings" JSONB NOT NULL DEFAULT '{"allowVoteEdit":true,"adminCanSeeVoterIdentity":true,"liveResults":false,"minVotesThreshold":0,"aggregationMethod":"weighted_mean"}',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'PARTICIPANT',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTeam" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "presentationOrder" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,

    CONSTRAINT "RoomTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomConfigVersion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "RoomConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minScore" INTEGER NOT NULL DEFAULT 1,
    "maxScore" INTEGER NOT NULL DEFAULT 10,
    "step" INTEGER NOT NULL DEFAULT 1,
    "weight" DECIMAL(8,4) NOT NULL DEFAULT 1.0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingRound" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "RoundStat" NOT NULL DEFAULT 'PENDING',
    "configVersionId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VotingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteScore" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "VoteScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ImportStat" NOT NULL DEFAULT 'PENDING',
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_joinCode_key" ON "Room"("joinCode");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomTeam_roomId_presentationOrder_idx" ON "RoomTeam"("roomId", "presentationOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTeam_roomId_teamId_key" ON "RoomTeam"("roomId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTeam_teamId_roomId_key" ON "RoomTeam"("teamId", "roomId");

-- CreateIndex
CREATE INDEX "RoomConfigVersion_roomId_isCurrent_idx" ON "RoomConfigVersion"("roomId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "RoomConfigVersion_roomId_version_key" ON "RoomConfigVersion"("roomId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RoomConfigVersion_id_roomId_key" ON "RoomConfigVersion"("id", "roomId");

-- CreateIndex
CREATE INDEX "Category_roomId_displayOrder_idx" ON "Category"("roomId", "displayOrder");

-- CreateIndex
CREATE INDEX "Category_configVersionId_idx" ON "Category"("configVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_roomId_key" ON "Category"("id", "roomId");

-- CreateIndex
CREATE INDEX "VotingRound_roomId_status_idx" ON "VotingRound"("roomId", "status");

-- CreateIndex
CREATE INDEX "VotingRound_teamId_idx" ON "VotingRound"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "VotingRound_id_roomId_key" ON "VotingRound"("id", "roomId");

-- CreateIndex
CREATE INDEX "Vote_roomId_teamId_idx" ON "Vote"("roomId", "teamId");

-- CreateIndex
CREATE INDEX "Vote_voterId_idx" ON "Vote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_roundId_voterId_key" ON "Vote"("roundId", "voterId");

-- CreateIndex
CREATE INDEX "VoteScore_categoryId_idx" ON "VoteScore"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteScore_voteId_categoryId_key" ON "VoteScore"("voteId", "categoryId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_createdById_idx" ON "ImportJob"("createdById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTeam" ADD CONSTRAINT "RoomTeam_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTeam" ADD CONSTRAINT "RoomTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomConfigVersion" ADD CONSTRAINT "RoomConfigVersion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_configVersionId_roomId_fkey" FOREIGN KEY ("configVersionId", "roomId") REFERENCES "RoomConfigVersion"("id", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_configVersionId_roomId_fkey" FOREIGN KEY ("configVersionId", "roomId") REFERENCES "RoomConfigVersion"("id", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_teamId_roomId_fkey" FOREIGN KEY ("teamId", "roomId") REFERENCES "RoomTeam"("teamId", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_roundId_roomId_fkey" FOREIGN KEY ("roundId", "roomId") REFERENCES "VotingRound"("id", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteScore" ADD CONSTRAINT "VoteScore_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "Vote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteScore" ADD CONSTRAINT "VoteScore_categoryId_roomId_fkey" FOREIGN KEY ("categoryId", "roomId") REFERENCES "Category"("id", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
