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

CREATE UNIQUE INDEX "OfflineIdentityMember_offlineIdentityId_communityId_key" ON "OfflineIdentityMember"("offlineIdentityId", "communityId");
CREATE UNIQUE INDEX "OfflineIdentityMember_communityId_userId_key" ON "OfflineIdentityMember"("communityId", "userId");
CREATE UNIQUE INDEX "OfflineIdentityMember_userId_key" ON "OfflineIdentityMember"("userId");
CREATE INDEX "OfflineIdentityMember_communityId_idx" ON "OfflineIdentityMember"("communityId");
CREATE UNIQUE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_sourceUserId_targetCommunityId_targetUserId_key" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "sourceUserId", "targetCommunityId", "targetUserId");
CREATE INDEX "OfflineIdentityLinkRequest_sourceCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("sourceCommunityId", "status");
CREATE INDEX "OfflineIdentityLinkRequest_targetCommunityId_status_idx" ON "OfflineIdentityLinkRequest"("targetCommunityId", "status");
CREATE INDEX "OfflineIdentityLinkRequest_offlineIdentityId_idx" ON "OfflineIdentityLinkRequest"("offlineIdentityId");
