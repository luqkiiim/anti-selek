-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarKey" TEXT,
    "selfNameChangedAt" DATETIME,
    "selfGenderChangedAt" DATETIME,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "gender" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "partnerPreference" TEXT NOT NULL DEFAULT 'OPEN',
    "mixedSideOverride" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Community" (
    "allowJoinRequests" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rules" TEXT NOT NULL DEFAULT '',
    "avatarKey" TEXT,
    "isPasswordProtected" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "createdById" TEXT NOT NULL,
    "isTutorial" BOOLEAN NOT NULL DEFAULT false,
    "tutorialOwnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubRatingAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "beforeElo" INTEGER NOT NULL,
    "afterElo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubRatingAdjustment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CommunityMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "achievementPreferencesJson" TEXT NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'CORE',
    "preferredPool" TEXT NOT NULL DEFAULT 'B',
    "needsMoreRest" BOOLEAN NOT NULL DEFAULT false,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "achievementEligibilityJson" TEXT NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "communityId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POINTS',
    "mode" TEXT NOT NULL DEFAULT 'MEXICANO',
    "collabFormat" TEXT NOT NULL DEFAULT 'FREE_PLAY',
    "scoringType" TEXT NOT NULL DEFAULT 'POINTS',
    "matchmakingStyle" TEXT NOT NULL DEFAULT 'BALANCED',
    "balanceMetric" TEXT NOT NULL DEFAULT 'SESSION_POINTS',
    "pairingMode" TEXT NOT NULL DEFAULT 'OPEN',
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "sourceSessionId" TEXT,
    "autoQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "respectPlayerRest" BOOLEAN NOT NULL DEFAULT true,
    "poolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "poolAssignmentsInitialized" BOOLEAN NOT NULL DEFAULT false,
    "poolAName" TEXT,
    "poolBName" TEXT,
    "poolACourtAssignments" INTEGER NOT NULL DEFAULT 0,
    "poolBCourtAssignments" INTEGER NOT NULL DEFAULT 0,
    "poolAMissedTurns" INTEGER NOT NULL DEFAULT 0,
    "poolBMissedTurns" INTEGER NOT NULL DEFAULT 0,
    "crossoverMissThreshold" INTEGER NOT NULL DEFAULT 1,
    "crossoverFrequency" TEXT NOT NULL DEFAULT 'BALANCED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Session_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionCommunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTNER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionCommunity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "label" TEXT,
    "currentMatchId" TEXT,
    CONSTRAINT "Court_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Court_currentMatchId_fkey" FOREIGN KEY ("currentMatchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "representingClubId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "gender" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "partnerPreference" TEXT NOT NULL DEFAULT 'OPEN',
    "mixedSideOverride" TEXT,
    "pool" TEXT NOT NULL DEFAULT 'A',
    "pendingPool" TEXT,
    "needsMoreRest" BOOLEAN NOT NULL DEFAULT false,
    "sessionPoints" INTEGER NOT NULL DEFAULT 0,
    "lastPartnerId" TEXT,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "matchmakingMatchesCredit" INTEGER NOT NULL DEFAULT 0,
    "availableSince" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPlayedAt" DATETIME,
    "pausedAt" DATETIME,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ladderEntryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivalPriorityAt" DATETIME,
    "skipNextMatchAt" DATETIME,
    "skipNextMatchRequestedById" TEXT,
    "inactiveSeconds" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scoreSubmittedByUserId" TEXT,
    "team1User1Id" TEXT NOT NULL,
    "team1User2Id" TEXT NOT NULL,
    "team1ClubId" TEXT,
    "team1Score" INTEGER,
    "team2User1Id" TEXT NOT NULL,
    "team2User2Id" TEXT NOT NULL,
    "team2ClubId" TEXT,
    "team2Score" INTEGER,
    "winnerTeam" INTEGER,
    "team1EloChange" INTEGER,
    "team2EloChange" INTEGER,
    "courtGroupType" TEXT,
    "poolASeatCount" INTEGER,
    "poolBSeatCount" INTEGER,
    "matchmakingReasonJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Match_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team1User1Id_fkey" FOREIGN KEY ("team1User1Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team1User2Id_fkey" FOREIGN KEY ("team1User2Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User1Id_fkey" FOREIGN KEY ("team2User1Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User2Id_fkey" FOREIGN KEY ("team2User2Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchEloAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "beforeElo" INTEGER NOT NULL,
    "afterElo" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchEloAdjustment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchEloAdjustment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchEloAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueuedMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "team1User1Id" TEXT NOT NULL,
    "team1User2Id" TEXT NOT NULL,
    "team1ClubId" TEXT,
    "team2User1Id" TEXT NOT NULL,
    "team2User2Id" TEXT NOT NULL,
    "team2ClubId" TEXT,
    "targetPool" TEXT,
    "courtGroupType" TEXT,
    "poolASeatCount" INTEGER,
    "poolBSeatCount" INTEGER,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "matchmakingReasonJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueuedMatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimRequest_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfflineIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT,
    "resolvedUserId" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfflineIdentity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentity_resolvedUserId_fkey" FOREIGN KEY ("resolvedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfflineIdentityMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineIdentityId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflineIdentityMember_offlineIdentityId_fkey" FOREIGN KEY ("offlineIdentityId") REFERENCES "OfflineIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfflineIdentityLinkRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineIdentityId" TEXT,
    "sourceCommunityId" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "targetCommunityId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfflineIdentityLinkRequest_offlineIdentityId_fkey" FOREIGN KEY ("offlineIdentityId") REFERENCES "OfflineIdentity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_sourceCommunityId_fkey" FOREIGN KEY ("sourceCommunityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_targetCommunityId_fkey" FOREIGN KEY ("targetCommunityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TutorialProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tutorialKey" TEXT NOT NULL,
    "completedStepIdsJson" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TutorialProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubNewsLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubNewsLike_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNewsLike_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNewsLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "newsType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubNotification_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNotification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubJoinRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    CONSTRAINT "ClubJoinRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Community_name_key" ON "Community"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Community_tutorialOwnerId_key" ON "Community"("tutorialOwnerId");

-- CreateIndex
CREATE INDEX "Community_isTutorial_idx" ON "Community"("isTutorial");

-- CreateIndex
CREATE INDEX "ClubRatingAdjustment_memberId_createdAt_idx" ON "ClubRatingAdjustment"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_communityId_userId_key" ON "CommunityMember"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_code_key" ON "Session"("code");

-- CreateIndex
CREATE INDEX "SessionCommunity_communityId_status_idx" ON "SessionCommunity"("communityId", "status");

-- CreateIndex
CREATE INDEX "SessionCommunity_sessionId_role_idx" ON "SessionCommunity"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SessionCommunity_sessionId_communityId_key" ON "SessionCommunity"("sessionId", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "Court_currentMatchId_key" ON "Court"("currentMatchId");

-- CreateIndex
CREATE INDEX "SessionPlayer_sessionId_representingClubId_idx" ON "SessionPlayer"("sessionId", "representingClubId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPlayer_sessionId_userId_key" ON "SessionPlayer"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "Match_sessionId_team1ClubId_idx" ON "Match"("sessionId", "team1ClubId");

-- CreateIndex
CREATE INDEX "Match_sessionId_team2ClubId_idx" ON "Match"("sessionId", "team2ClubId");

-- CreateIndex
CREATE INDEX "MatchEloAdjustment_communityId_userId_idx" ON "MatchEloAdjustment"("communityId", "userId");

-- CreateIndex
CREATE INDEX "MatchEloAdjustment_userId_idx" ON "MatchEloAdjustment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEloAdjustment_matchId_communityId_userId_key" ON "MatchEloAdjustment"("matchId", "communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "QueuedMatch_sessionId_key" ON "QueuedMatch"("sessionId");

-- CreateIndex
CREATE INDEX "ClaimRequest_communityId_status_idx" ON "ClaimRequest"("communityId", "status");

-- CreateIndex
CREATE INDEX "ClaimRequest_requesterUserId_status_idx" ON "ClaimRequest"("requesterUserId", "status");

-- CreateIndex
CREATE INDEX "ClaimRequest_targetUserId_status_idx" ON "ClaimRequest"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "OfflineIdentityMember_communityId_idx" ON "OfflineIdentityMember"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineIdentityMember_offlineIdentityId_communityId_key" ON "OfflineIdentityMember"("offlineIdentityId", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineIdentityMember_communityId_userId_key" ON "OfflineIdentityMember"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineIdentityMember_userId_key" ON "OfflineIdentityMember"("userId");

-- CreateIndex
CREATE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "status");

-- CreateIndex
CREATE INDEX "OfflineIdentityLinkRequest_targetCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("targetCommunityId", "status");

-- CreateIndex
CREATE INDEX "OfflineIdentityLinkRequest_offlineIdentityId_idx" ON "OfflineIdentityLinkRequest"("offlineIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_sourceUserId_targetCommunityId_targetUserId_key" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "sourceUserId", "targetCommunityId", "targetUserId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_scope_idx" ON "RateLimitBucket"("scope");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "TutorialProgress_tutorialKey_idx" ON "TutorialProgress"("tutorialKey");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialProgress_userId_tutorialKey_key" ON "TutorialProgress"("userId", "tutorialKey");

-- CreateIndex
CREATE INDEX "ClubNewsLike_communityId_sessionId_idx" ON "ClubNewsLike"("communityId", "sessionId");

-- CreateIndex
CREATE INDEX "ClubNewsLike_userId_idx" ON "ClubNewsLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNewsLike_newsItemId_userId_key" ON "ClubNewsLike"("newsItemId", "userId");

-- CreateIndex
CREATE INDEX "ClubNotification_communityId_recipientUserId_readAt_createdAt_idx" ON "ClubNotification"("communityId", "recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "ClubNotification_recipientUserId_createdAt_idx" ON "ClubNotification"("recipientUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNotification_type_newsItemId_actorUserId_recipientUserId_key" ON "ClubNotification"("type", "newsItemId", "actorUserId", "recipientUserId");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_clubId_status_idx" ON "ClubJoinRequest"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubJoinRequest_clubId_userId_key" ON "ClubJoinRequest"("clubId", "userId");
