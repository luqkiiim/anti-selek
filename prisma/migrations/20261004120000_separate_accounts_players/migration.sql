-- Account/Player separation. This migration owns its transaction.
-- Disable FKs BEFORE BEGIN so table rebuilds cannot cascade-delete sporting history.
-- ACCOUNT_PLAYER_MANAGED_TRANSACTION
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
CREATE TABLE "_account_player_migration_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 1));
-- Fail closed on malformed legacy accounts instead of creating unusable auth identities.
INSERT INTO "_account_player_migration_guard" ("ok") SELECT CASE WHEN EXISTS (SELECT 1 FROM "User" WHERE "isClaimed" = 1 AND ("email" IS NULL OR "passwordHash" IS NULL OR trim("email") = '' OR trim("passwordHash") = '')) THEN 0 ELSE 1 END;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarKey" TEXT,
    "selfNameChangedAt" DATETIME,
    "selfGenderChangedAt" DATETIME,
    "gender" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);


-- Copy credentials only for genuine legacy registered accounts; no account is invented for an offline Player.
INSERT INTO "Account" ("id", "email", "passwordHash", "name", "avatarKey", "selfNameChangedAt", "selfGenderChangedAt", "gender", "isActive", "createdAt", "updatedAt")
SELECT "id", "email", "passwordHash", "name", "avatarKey", "selfNameChangedAt", "selfGenderChangedAt", "gender", "isActive", "createdAt", "updatedAt" FROM "User" WHERE "isClaimed" = 1;

-- CreateTable
CREATE TABLE "ClubAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClubAccess_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubAdmissionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admissionRequestId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubAdmissionEvent_admissionRequestId_fkey" FOREIGN KEY ("admissionRequestId") REFERENCES "ClubJoinRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClubAdmissionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarKey", "createdAt", "elo", "email", "gender", "id", "isActive", "isClaimed", "mixedSideOverride", "name", "partnerPreference", "passwordHash", "selfGenderChangedAt", "selfNameChangedAt", "updatedAt") SELECT "avatarKey", "createdAt", "elo", "email", "gender", "id", "isActive", "isClaimed", "mixedSideOverride", "name", "partnerPreference", "passwordHash", "selfGenderChangedAt", "selfNameChangedAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_ownerUserId_idx" ON "User"("ownerUserId");
CREATE TABLE "new_Community" (
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
    CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Community" ("allowJoinRequests", "avatarKey", "createdAt", "createdById", "id", "isPasswordProtected", "isTutorial", "name", "passwordHash", "rules", "tutorialOwnerId", "updatedAt") SELECT "allowJoinRequests", "avatarKey", "createdAt", "createdById", "id", "isPasswordProtected", "isTutorial", "name", "passwordHash", "rules", "tutorialOwnerId", "updatedAt" FROM "Community";
DROP TABLE "Community";
ALTER TABLE "new_Community" RENAME TO "Community";
CREATE UNIQUE INDEX "Community_name_key" ON "Community"("name");
CREATE UNIQUE INDEX "Community_tutorialOwnerId_key" ON "Community"("tutorialOwnerId");
CREATE INDEX "Community_isTutorial_idx" ON "Community"("isTutorial");
CREATE TABLE "new_CommunityMember" (
    "achievementPreferencesJson" TEXT NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'CORE',
    "preferredPool" TEXT NOT NULL DEFAULT 'B',
    "needsMoreRest" BOOLEAN NOT NULL DEFAULT false,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunityMember_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CommunityMember" ("achievementPreferencesJson", "communityId", "createdAt", "elo", "id", "needsMoreRest", "preferredPool", "role", "status", "userId") SELECT "achievementPreferencesJson", "communityId", "createdAt", "elo", "id", "needsMoreRest", "preferredPool", "role", "status", "userId" FROM "CommunityMember";
DROP TABLE "CommunityMember";
ALTER TABLE "new_CommunityMember" RENAME TO "CommunityMember";
CREATE UNIQUE INDEX "CommunityMember_communityId_userId_key" ON "CommunityMember"("communityId", "userId");
CREATE UNIQUE INDEX "CommunityMember_communityId_ownerUserId_key" ON "CommunityMember"("communityId", "ownerUserId");
-- Preserve every manual rating adjustment and its registered-account actor.
CREATE TABLE "new_ClubRatingAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "beforeElo" INTEGER NOT NULL,
    "afterElo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubRatingAdjustment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CommunityMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubRatingAdjustment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClubRatingAdjustment" ("id", "memberId", "actorId", "actorName", "beforeElo", "afterElo", "reason", "createdAt")
SELECT "id", "memberId", "actorId", "actorName", "beforeElo", "afterElo", "reason", "createdAt" FROM "ClubRatingAdjustment";
DROP TABLE "ClubRatingAdjustment";
ALTER TABLE "new_ClubRatingAdjustment" RENAME TO "ClubRatingAdjustment";
CREATE INDEX "ClubRatingAdjustment_memberId_createdAt_idx" ON "ClubRatingAdjustment"("memberId", "createdAt");
CREATE TABLE "new_SessionCommunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTNER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "creditedHostPlayerId" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionCommunity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_creditedHostPlayerId_fkey" FOREIGN KEY ("creditedHostPlayerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SessionCommunity" ("communityId", "createdAt", "id", "requestedById", "reviewedAt", "reviewedById", "role", "sessionId", "status", "updatedAt") SELECT "communityId", "createdAt", "id", "requestedById", "reviewedAt", "reviewedById", "role", "sessionId", "status", "updatedAt" FROM "SessionCommunity";
DROP TABLE "SessionCommunity";
ALTER TABLE "new_SessionCommunity" RENAME TO "SessionCommunity";
CREATE INDEX "SessionCommunity_communityId_status_idx" ON "SessionCommunity"("communityId", "status");
CREATE INDEX "SessionCommunity_sessionId_role_idx" ON "SessionCommunity"("sessionId", "role");
CREATE UNIQUE INDEX "SessionCommunity_sessionId_communityId_key" ON "SessionCommunity"("sessionId", "communityId");
CREATE TABLE "new_SessionPlayer" (
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
    CONSTRAINT "SessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SessionPlayer" ("arrivalPriorityAt", "availableSince", "gender", "id", "inactiveSeconds", "isGuest", "isPaused", "joinedAt", "ladderEntryAt", "lastPartnerId", "lastPlayedAt", "matchesPlayed", "matchmakingMatchesCredit", "mixedSideOverride", "needsMoreRest", "partnerPreference", "pausedAt", "pendingPool", "pool", "representingClubId", "sessionId", "sessionPoints", "skipNextMatchAt", "skipNextMatchRequestedById", "userId") SELECT "arrivalPriorityAt", "availableSince", "gender", "id", "inactiveSeconds", "isGuest", "isPaused", "joinedAt", "ladderEntryAt", "lastPartnerId", "lastPlayedAt", "matchesPlayed", "matchmakingMatchesCredit", "mixedSideOverride", "needsMoreRest", "partnerPreference", "pausedAt", "pendingPool", "pool", "representingClubId", "sessionId", "sessionPoints", "skipNextMatchAt", "skipNextMatchRequestedById", "userId" FROM "SessionPlayer";
DROP TABLE "SessionPlayer";
ALTER TABLE "new_SessionPlayer" RENAME TO "SessionPlayer";
CREATE INDEX "SessionPlayer_sessionId_representingClubId_idx" ON "SessionPlayer"("sessionId", "representingClubId");
CREATE UNIQUE INDEX "SessionPlayer_sessionId_userId_key" ON "SessionPlayer"("sessionId", "userId");
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scoreSubmittedByUserId" TEXT,
    "scoreSubmittedByPlayerId" TEXT,
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
    CONSTRAINT "Match_team1User1Id_fkey" FOREIGN KEY ("team1User1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_team1User2Id_fkey" FOREIGN KEY ("team1User2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User1Id_fkey" FOREIGN KEY ("team2User1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User2Id_fkey" FOREIGN KEY ("team2User2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_scoreSubmittedByUserId_fkey" FOREIGN KEY ("scoreSubmittedByUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_scoreSubmittedByPlayerId_fkey" FOREIGN KEY ("scoreSubmittedByPlayerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("completedAt", "courtGroupType", "courtId", "createdAt", "id", "matchmakingReasonJson", "poolASeatCount", "poolBSeatCount", "scoreSubmittedByUserId", "sessionId", "status", "team1ClubId", "team1EloChange", "team1Score", "team1User1Id", "team1User2Id", "team2ClubId", "team2EloChange", "team2Score", "team2User1Id", "team2User2Id", "winnerTeam") SELECT "completedAt", "courtGroupType", "courtId", "createdAt", "id", "matchmakingReasonJson", "poolASeatCount", "poolBSeatCount", "scoreSubmittedByUserId", "sessionId", "status", "team1ClubId", "team1EloChange", "team1Score", "team1User1Id", "team1User2Id", "team2ClubId", "team2EloChange", "team2Score", "team2User1Id", "team2User2Id", "winnerTeam" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_sessionId_team1ClubId_idx" ON "Match"("sessionId", "team1ClubId");
CREATE INDEX "Match_sessionId_team2ClubId_idx" ON "Match"("sessionId", "team2ClubId");
CREATE TABLE "new_MatchEloAdjustment" (
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
    CONSTRAINT "MatchEloAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MatchEloAdjustment" ("afterElo", "beforeElo", "communityId", "createdAt", "delta", "id", "matchId", "userId") SELECT "afterElo", "beforeElo", "communityId", "createdAt", "delta", "id", "matchId", "userId" FROM "MatchEloAdjustment";
DROP TABLE "MatchEloAdjustment";
ALTER TABLE "new_MatchEloAdjustment" RENAME TO "MatchEloAdjustment";
CREATE INDEX "MatchEloAdjustment_communityId_userId_idx" ON "MatchEloAdjustment"("communityId", "userId");
CREATE INDEX "MatchEloAdjustment_userId_idx" ON "MatchEloAdjustment"("userId");
CREATE UNIQUE INDEX "MatchEloAdjustment_matchId_communityId_userId_key" ON "MatchEloAdjustment"("matchId", "communityId", "userId");
CREATE TABLE "new_ClaimRequest" (
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
    CONSTRAINT "ClaimRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClaimRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClaimRequest" ("communityId", "createdAt", "id", "note", "requesterUserId", "reviewedAt", "reviewedById", "status", "targetUserId", "updatedAt") SELECT "communityId", "createdAt", "id", "note", "requesterUserId", "reviewedAt", "reviewedById", "status", "targetUserId", "updatedAt" FROM "ClaimRequest";
DROP TABLE "ClaimRequest";
ALTER TABLE "new_ClaimRequest" RENAME TO "ClaimRequest";
CREATE INDEX "ClaimRequest_communityId_status_idx" ON "ClaimRequest"("communityId", "status");
CREATE INDEX "ClaimRequest_requesterUserId_status_idx" ON "ClaimRequest"("requesterUserId", "status");
CREATE INDEX "ClaimRequest_targetUserId_status_idx" ON "ClaimRequest"("targetUserId", "status");
CREATE TABLE "new_OfflineIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT,
    "resolvedUserId" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfflineIdentity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentity_resolvedUserId_fkey" FOREIGN KEY ("resolvedUserId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OfflineIdentity" ("createdAt", "createdById", "id", "resolvedAt", "resolvedUserId", "updatedAt") SELECT "createdAt", "createdById", "id", "resolvedAt", "resolvedUserId", "updatedAt" FROM "OfflineIdentity";
DROP TABLE "OfflineIdentity";
ALTER TABLE "new_OfflineIdentity" RENAME TO "OfflineIdentity";
CREATE TABLE "new_OfflineIdentityMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineIdentityId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflineIdentityMember_offlineIdentityId_fkey" FOREIGN KEY ("offlineIdentityId") REFERENCES "OfflineIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OfflineIdentityMember" ("addedById", "communityId", "createdAt", "id", "offlineIdentityId", "userId") SELECT "addedById", "communityId", "createdAt", "id", "offlineIdentityId", "userId" FROM "OfflineIdentityMember";
DROP TABLE "OfflineIdentityMember";
ALTER TABLE "new_OfflineIdentityMember" RENAME TO "OfflineIdentityMember";
CREATE INDEX "OfflineIdentityMember_communityId_idx" ON "OfflineIdentityMember"("communityId");
CREATE UNIQUE INDEX "OfflineIdentityMember_offlineIdentityId_communityId_key" ON "OfflineIdentityMember"("offlineIdentityId", "communityId");
CREATE UNIQUE INDEX "OfflineIdentityMember_communityId_userId_key" ON "OfflineIdentityMember"("communityId", "userId");
CREATE UNIQUE INDEX "OfflineIdentityMember_userId_key" ON "OfflineIdentityMember"("userId");
CREATE TABLE "new_OfflineIdentityLinkRequest" (
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
    CONSTRAINT "OfflineIdentityLinkRequest_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OfflineIdentityLinkRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OfflineIdentityLinkRequest" ("createdAt", "id", "offlineIdentityId", "requestedById", "reviewedAt", "reviewedById", "sourceCommunityId", "sourceUserId", "status", "targetCommunityId", "targetUserId", "updatedAt") SELECT "createdAt", "id", "offlineIdentityId", "requestedById", "reviewedAt", "reviewedById", "sourceCommunityId", "sourceUserId", "status", "targetCommunityId", "targetUserId", "updatedAt" FROM "OfflineIdentityLinkRequest";
DROP TABLE "OfflineIdentityLinkRequest";
ALTER TABLE "new_OfflineIdentityLinkRequest" RENAME TO "OfflineIdentityLinkRequest";
CREATE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "status");
CREATE INDEX "OfflineIdentityLinkRequest_targetCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("targetCommunityId", "status");
CREATE INDEX "OfflineIdentityLinkRequest_offlineIdentityId_idx" ON "OfflineIdentityLinkRequest"("offlineIdentityId");
CREATE UNIQUE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_sourceUserId_targetCommunityId_targetUserId_key" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "sourceUserId", "targetCommunityId", "targetUserId");
CREATE TABLE "new_PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PasswordResetToken" ("createdAt", "expiresAt", "id", "tokenHash", "updatedAt", "usedAt", "userId") SELECT "createdAt", "expiresAt", "id", "tokenHash", "updatedAt", "usedAt", "userId" FROM "PasswordResetToken";
DROP TABLE "PasswordResetToken";
ALTER TABLE "new_PasswordResetToken" RENAME TO "PasswordResetToken";
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE TABLE "new_TutorialProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tutorialKey" TEXT NOT NULL,
    "completedStepIdsJson" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TutorialProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TutorialProgress" ("completedStepIdsJson", "createdAt", "dismissedAt", "id", "tutorialKey", "updatedAt", "userId") SELECT "completedStepIdsJson", "createdAt", "dismissedAt", "id", "tutorialKey", "updatedAt", "userId" FROM "TutorialProgress";
DROP TABLE "TutorialProgress";
ALTER TABLE "new_TutorialProgress" RENAME TO "TutorialProgress";
CREATE INDEX "TutorialProgress_tutorialKey_idx" ON "TutorialProgress"("tutorialKey");
CREATE UNIQUE INDEX "TutorialProgress_userId_tutorialKey_key" ON "TutorialProgress"("userId", "tutorialKey");
CREATE TABLE "new_ClubNewsLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubNewsLike_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNewsLike_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubNewsLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClubNewsLike" ("communityId", "createdAt", "id", "newsItemId", "sessionId", "userId") SELECT "communityId", "createdAt", "id", "newsItemId", "sessionId", "userId" FROM "ClubNewsLike";
DROP TABLE "ClubNewsLike";
ALTER TABLE "new_ClubNewsLike" RENAME TO "ClubNewsLike";
CREATE INDEX "ClubNewsLike_communityId_sessionId_idx" ON "ClubNewsLike"("communityId", "sessionId");
CREATE INDEX "ClubNewsLike_userId_idx" ON "ClubNewsLike"("userId");
CREATE UNIQUE INDEX "ClubNewsLike_newsItemId_userId_key" ON "ClubNewsLike"("newsItemId", "userId");
CREATE TABLE "new_ClubNotification" (
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
    CONSTRAINT "ClubNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClubNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClubNotification" ("actorUserId", "communityId", "createdAt", "detail", "id", "newsItemId", "newsType", "readAt", "recipientUserId", "sessionId", "title", "type", "value") SELECT "actorUserId", "communityId", "createdAt", "detail", "id", "newsItemId", "newsType", "readAt", "recipientUserId", "sessionId", "title", "type", "value" FROM "ClubNotification";
DROP TABLE "ClubNotification";
ALTER TABLE "new_ClubNotification" RENAME TO "ClubNotification";
CREATE INDEX "ClubNotification_communityId_recipientUserId_readAt_createdAt_idx" ON "ClubNotification"("communityId", "recipientUserId", "readAt", "createdAt");
CREATE INDEX "ClubNotification_recipientUserId_createdAt_idx" ON "ClubNotification"("recipientUserId", "createdAt");
CREATE UNIQUE INDEX "ClubNotification_type_newsItemId_actorUserId_recipientUserId_key" ON "ClubNotification"("type", "newsItemId", "actorUserId", "recipientUserId");
CREATE TABLE "new_ClubJoinRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NEW_PLAYER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedPlayerId" TEXT,
    "approvedPlayerId" TEXT,
    "proposedPlayerName" TEXT,
    "proposedGender" TEXT,
    "note" TEXT,
    "decision" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "legacyClaimRequestId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    CONSTRAINT "ClubJoinRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClubJoinRequest_requestedPlayerId_fkey" FOREIGN KEY ("requestedPlayerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClubJoinRequest_approvedPlayerId_fkey" FOREIGN KEY ("approvedPlayerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClubJoinRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClubJoinRequest" ("clubId", "createdAt", "id", "reviewedAt", "reviewedById", "status", "userId", "updatedAt") SELECT "clubId", "createdAt", "id", "reviewedAt", "reviewedById", "status", "userId", COALESCE("reviewedAt", "createdAt") FROM "ClubJoinRequest";
DROP TABLE "ClubJoinRequest";
ALTER TABLE "new_ClubJoinRequest" RENAME TO "ClubJoinRequest";
CREATE UNIQUE INDEX "ClubJoinRequest_legacyClaimRequestId_key" ON "ClubJoinRequest"("legacyClaimRequestId");
CREATE INDEX "ClubJoinRequest_clubId_status_idx" ON "ClubJoinRequest"("clubId", "status");
CREATE UNIQUE INDEX "ClubJoinRequest_userId_idempotencyKey_key" ON "ClubJoinRequest"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "ClubAccess_userId_status_idx" ON "ClubAccess"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAccess_clubId_userId_key" ON "ClubAccess"("clubId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAdmissionEvent_admissionRequestId_revision_key" ON "ClubAdmissionEvent"("admissionRequestId", "revision");

-- Establish sporting ownership without changing ANY legacy sporting ID/value.
UPDATE "User" SET "ownerUserId" = "id" WHERE EXISTS (SELECT 1 FROM "Account" WHERE "Account"."id" = "User"."id");
UPDATE "CommunityMember" SET "ownerUserId" = (SELECT "ownerUserId" FROM "User" WHERE "User"."id" = "CommunityMember"."userId");

-- Roles move to independent account authorization; placeholder roles never grant account powers.
INSERT INTO "ClubAccess" ("id", "clubId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT 'legacy-access:' || m."id", m."communityId", m."ownerUserId", m."role", 'ACTIVE', m."createdAt", m."createdAt" FROM "CommunityMember" m WHERE m."ownerUserId" IS NOT NULL;
-- Preserve creator authority for existing non-playing creators.
INSERT INTO "ClubAccess" ("id", "clubId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT 'legacy-owner:' || c."id", c."id", c."createdById", 'OWNER', 'ACTIVE', c."createdAt", c."createdAt" FROM "Community" c WHERE NOT EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."clubId"=c."id" AND a."userId"=c."createdById");

-- Preserve authenticated score actors; infer a playing submitter only when the old actor was a participant.
UPDATE "Match" SET "scoreSubmittedByPlayerId" = "scoreSubmittedByUserId" WHERE "scoreSubmittedByUserId" IN ("team1User1Id", "team1User2Id", "team2User1Id", "team2User2Id");
-- Hosting achievements formerly credited the legacy playing identity of the requester.
UPDATE "SessionCommunity" SET "creditedHostPlayerId" = "requestedById" WHERE "requestedById" IS NOT NULL AND EXISTS (SELECT 1 FROM "User" p WHERE p."id"="SessionCommunity"."requestedById");

-- Legacy join rows and claim records stay intact; pending claims enter the unified inbox.
UPDATE "ClubJoinRequest" SET "kind" = CASE WHEN EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"="ClubJoinRequest"."clubId" AND m."ownerUserId"="ClubJoinRequest"."userId") THEN 'OWNED_PLAYER' ELSE 'NEW_PLAYER' END, "requestedPlayerId" = (SELECT m."userId" FROM "CommunityMember" m WHERE m."communityId"="ClubJoinRequest"."clubId" AND m."ownerUserId"="ClubJoinRequest"."userId" LIMIT 1), "approvedPlayerId" = CASE WHEN "status"='APPROVED' THEN (SELECT m."userId" FROM "CommunityMember" m WHERE m."communityId"="ClubJoinRequest"."clubId" AND m."ownerUserId"="ClubJoinRequest"."userId" LIMIT 1) ELSE NULL END;
INSERT INTO "ClubJoinRequest" ("id", "clubId", "userId", "kind", "status", "requestedPlayerId", "note", "legacyClaimRequestId", "createdAt", "updatedAt", "reviewedAt", "reviewedById")
SELECT 'legacy-claim:' || "id", "communityId", "requesterUserId", 'EXISTING_PLAYER', "status", "targetUserId", "note", "id", "createdAt", "updatedAt", "reviewedAt", "reviewedById" FROM "ClaimRequest";
INSERT INTO "ClubAdmissionEvent" ("id", "admissionRequestId", "actorUserId", "action", "revision", "detailsJson", "createdAt")
SELECT 'legacy-event:' || "id", "id", "reviewedById", 'MIGRATED', 0, json_object('legacyStatus', "status", 'legacyClaimRequestId', "legacyClaimRequestId"), "updatedAt" FROM "ClubJoinRequest";

-- One active request per account/club, without reserving a Player against other applicants.
CREATE UNIQUE INDEX "ClubJoinRequest_pending_account_club_key" ON "ClubJoinRequest" ("clubId", "userId") WHERE "status"='PENDING';

-- Ownership is permanent in Phase 1. Transfers/unlinking require a future audited workflow.
CREATE TRIGGER "Player_owner_immutable" BEFORE UPDATE OF "ownerUserId" ON "User" WHEN OLD."ownerUserId" IS NOT NULL AND NEW."ownerUserId" IS NOT OLD."ownerUserId" BEGIN SELECT RAISE(ABORT, 'PLAYER_OWNER_IMMUTABLE'); END;
CREATE TRIGGER "Player_owner_sync_rosters" AFTER UPDATE OF "ownerUserId" ON "User" BEGIN UPDATE "CommunityMember" SET "ownerUserId"=NEW."ownerUserId" WHERE "userId"=NEW."id"; END;
CREATE TRIGGER "ClubMember_owner_insert" BEFORE INSERT ON "CommunityMember" WHEN NEW."ownerUserId" IS NOT NULL AND NEW."ownerUserId" IS NOT (SELECT "ownerUserId" FROM "User" WHERE "id"=NEW."userId") BEGIN SELECT RAISE(ABORT, 'ROSTER_OWNER_MISMATCH'); END;
CREATE TRIGGER "ClubMember_owner_insert_sync" AFTER INSERT ON "CommunityMember" BEGIN UPDATE "CommunityMember" SET "ownerUserId"=(SELECT "ownerUserId" FROM "User" WHERE "id"=NEW."userId") WHERE "id"=NEW."id"; END;
CREATE TRIGGER "ClubMember_owner_update" BEFORE UPDATE OF "userId", "ownerUserId" ON "CommunityMember" WHEN NEW."ownerUserId" IS NOT (SELECT "ownerUserId" FROM "User" WHERE "id"=NEW."userId") BEGIN SELECT RAISE(ABORT, 'ROSTER_OWNER_MISMATCH'); END;

-- Historical Player and roster IDs must never be silently replaced.
CREATE TRIGGER "Player_id_immutable" BEFORE UPDATE OF "id" ON "User" WHEN NEW."id" IS NOT OLD."id" BEGIN SELECT RAISE(ABORT, 'PLAYER_ID_IMMUTABLE'); END;
CREATE TRIGGER "ClubMember_id_immutable" BEFORE UPDATE OF "id" ON "CommunityMember" WHEN NEW."id" IS NOT OLD."id" BEGIN SELECT RAISE(ABORT, 'ROSTER_ID_IMMUTABLE'); END;
CREATE TRIGGER "ClubMember_player_immutable" BEFORE UPDATE OF "userId", "communityId" ON "CommunityMember" WHEN NEW."userId" IS NOT OLD."userId" OR NEW."communityId" IS NOT OLD."communityId" BEGIN SELECT RAISE(ABORT, 'ROSTER_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER "ClubAdmissionEvent_no_update" BEFORE UPDATE ON "ClubAdmissionEvent" BEGIN SELECT RAISE(ABORT, 'ADMISSION_EVENT_IMMUTABLE'); END;
CREATE TRIGGER "ClubAdmissionEvent_no_delete" BEFORE DELETE ON "ClubAdmissionEvent" BEGIN SELECT RAISE(ABORT, 'ADMISSION_EVENT_IMMUTABLE'); END;
CREATE TRIGGER "ClubAdmissionRequest_terminal_immutable" BEFORE UPDATE ON "ClubJoinRequest" WHEN OLD."status" IN ('APPROVED','REJECTED','CANCELLED') BEGIN SELECT RAISE(ABORT, 'ADMISSION_TERMINAL_IMMUTABLE'); END;

-- Abort the transaction if any reconstructed FK or ownership projection is invalid.
INSERT INTO "_account_player_migration_guard" ("ok") SELECT CASE WHEN EXISTS (SELECT 1 FROM pragma_foreign_key_check) OR EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."ownerUserId" IS NOT p."ownerUserId") THEN 0 ELSE 1 END;
DROP TABLE "_account_player_migration_guard";
-- ACCOUNT_PLAYER_LEDGER_INSERT
COMMIT;
PRAGMA foreign_keys=ON;
