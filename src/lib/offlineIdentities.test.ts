import { describe, it } from "vitest";

import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";
import { toOfflineIdentityLinkResponse } from "@/lib/offlineIdentities";

describe("offline identity response contracts", () => {
  it("returns canonical source/target club fields with legacy aliases", () => {
    const response = toOfflineIdentityLinkResponse({
      id: "request-1",
      offlineIdentityId: "identity-1",
      sourceClubId: "community-1",
      sourceUserId: "source-user-1",
      targetClubId: "community-2",
      targetUserId: "target-user-1",
      status: "PENDING",
      requestedById: "admin-1",
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
      sourceClub: {
        id: "community-1",
        name: "Source Club",
      },
      targetClub: {
        id: "community-2",
        name: "Target Club",
      },
      sourceUser: {
        id: "source-user-1",
        name: "Source Player",
        email: null,
      },
      targetUser: {
        id: "target-user-1",
        name: "Target Player",
        email: null,
      },
      requestedBy: {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
      },
      reviewedBy: null,
    });

    expectAliasPair(response, "sourceClubId", "sourceCommunityId");
    expectAliasPair(response, "targetClubId", "targetCommunityId");
  });
});
