import { describe, expect, it } from "vitest";

import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";
import {
  isOfflineIdentityPlaceholder,
  toOfflineIdentityLinkResponse,
} from "@/lib/offlineIdentities";

describe("offline identity response contracts", () => {
  it("uses local ClubMember ownership rather than frozen Player provenance", () => {
    const legacyPlaceholder = {
      ownerUserId: null,
      player: { ownerUserId: "former-account" },
    };
    const locallyOwned = {
      ownerUserId: "current-account",
      player: { ownerUserId: null },
    };

    expect(isOfflineIdentityPlaceholder(legacyPlaceholder)).toBe(true);
    expect(isOfflineIdentityPlaceholder(locallyOwned)).toBe(false);
  });

  it("returns canonical source/target club fields with legacy aliases", () => {
    const response = toOfflineIdentityLinkResponse({
      id: "request-1",
      offlineIdentityId: "identity-1",
      sourceClubId: "community-1",
      sourcePlayerId: "source-user-1",
      targetClubId: "community-2",
      targetPlayerId: "target-user-1",
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
      sourcePlayer: {
        id: "source-user-1",
        name: "Source Player",
        ownerUser: null,
      },
      targetPlayer: {
        id: "target-user-1",
        name: "Target Player",
        ownerUser: null,
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
