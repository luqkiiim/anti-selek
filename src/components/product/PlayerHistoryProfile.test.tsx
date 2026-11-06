// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerProfileConnectionSummary } from "@/lib/profileStats";

const mocks = vi.hoisted(() => ({
  deletePlayerAvatar: vi.fn(),
  fetch: vi.fn(),
  router: {
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  uploadPlayerAvatar: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/avatarClient", () => ({
  deletePlayerAvatar: mocks.deletePlayerAvatar,
  uploadPlayerAvatar: mocks.uploadPlayerAvatar,
}));

vi.mock("@/components/product/Primitives", async importOriginal => ({
  ...await importOriginal<typeof import("./Primitives")>(),
  Sheet: ({ open = true, title, children, onClose }: {
    open?: boolean; title: string; children: React.ReactNode; onClose: () => void;
  }) => open ? <div role="dialog" aria-label={title}>{children}<button aria-label="Close" onClick={onClose}>Close</button></div> : null,
}));

import { PlayerHistoryProfile } from "./PlayerHistoryProfile";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildMatch(id: string, overrides?: Partial<{
  partner: {
    id: string;
    name: string;
    avatarUrl: string | null;
    profileClubId?: string | null;
  };
  opponents: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    profileClubId?: string | null;
  }>;
  score: string;
  result: "WIN" | "LOSS";
}>) {
  return {
    id,
    date: "2026-05-20T00:00:00.000Z",
    sessionId: "session-1",
    sessionCode: "session-1",
    sessionName: "Session 12",
    partner: overrides?.partner ?? {
      id: "partner-1",
      name: "Haziq Azman",
      avatarUrl: "https://cdn.test/avatars/haziq.jpg",
    },
    opponents: overrides?.opponents ?? [
      {
        id: "opponent-1",
        name: "Daniel Nabil",
        avatarUrl: "https://cdn.test/avatars/daniel.jpg",
      },
      {
        id: "opponent-2",
        name: "Khairul Zaim",
        avatarUrl: "https://cdn.test/avatars/khairul.jpg",
      },
    ],
    score: overrides?.score ?? "21-16",
    result: overrides?.result ?? "WIN",
    eloChange: 12,
    pointDifferential: 5,
  };
}

function buildRecentSession(id: string, overrides?: Partial<{
  date: string | null;
  wins: number;
  losses: number;
  pointDifferential: number;
  ratingChange: number;
}>) {
  const wins = overrides?.wins ?? 3;
  const losses = overrides?.losses ?? 1;

  return {
    id,
    code: id,
    name: "Friday Session",
    date: overrides?.date ?? "2026-05-20T00:00:00.000Z",
    matches: wins + losses,
    wins,
    losses,
    winRate: Math.round((wins / Math.max(wins + losses, 1)) * 100),
    pointDifferential: overrides?.pointDifferential ?? 18,
    ratingChange: overrides?.ratingChange ?? 12,
  };
}

function buildProfileResponse(overrides?: Partial<{
  avatarUrl: string | null;
  isRetired: boolean;
  context: {
    clubId: string;
    viewerCanManageClub: boolean;
    canAddGuestToClub?: boolean;
    rankContext: {
      leaderboardSize: number;
      currentRank: number | null;
      previousRank: number | null;
      rankDelta: number | null;
    };
  } | null;
  matchHistory: ReturnType<typeof buildMatch>[];
  name: string;
  recentSessions: ReturnType<typeof buildRecentSession>[];
}>) {
  const avatarUrl =
    overrides?.avatarUrl === undefined
      ? "https://cdn.test/avatars/alex.jpg"
      : overrides.avatarUrl;
  const name = overrides?.name ?? "Alex Lee";

  return {
    user: {
      id: "player-1",
      name,
      avatarUrl,
      elo: 1320,
      createdAt: "2026-05-01T00:00:00.000Z",
      isRetired: overrides?.isRetired ?? false,
    },
    context: overrides?.context ?? null,
    stats: {
      totalMatches: 12,
      wins: 7,
      losses: 5,
      winRate: 58,
      pointsScored: 210,
      pointsConceded: 190,
      pointDifferential: 20,
      sessionsPlayed: 4,
      averageMatchesPerSession: 3,
      lastPlayedAt: "2026-05-20T00:00:00.000Z",
    },
    recentForm: {
      matches: 5,
      wins: 3,
      losses: 2,
      winRate: 60,
      pointDifferential: 8,
      ratingChange: 12,
      currentStreak: {
        result: "WIN" as const,
        count: 2,
      },
    },
    recentSessions: overrides?.recentSessions ?? [buildRecentSession("session-1")],
    trend: {
      sessions: 3,
      matches: 9,
      wins: 5,
      losses: 4,
      winRate: 56,
      pointDifferential: 6,
      ratingChange: 10,
      direction: "RISING" as const,
      bestSession: null,
      worstSession: null,
    },
    partners: {
      best: [] as PlayerProfileConnectionSummary[],
    },
    opponents: {
      toughest: [] as PlayerProfileConnectionSummary[],
    },
    sessions: {
      latest: null,
      best: null,
    },
    achievements: [
      {
        id: "strong-start" as const,
        title: "Strong Start",
        description: "Win your first 2 matches.",
        progress: 2,
        target: 2,
        progressLabel: "wins",
        unlocked: true,
        earnedFromSession: {
          id: "session-1",
          code: "session-1",
          name: "Friday Session",
        },
      },
      {
        id: "close-battle-tested" as const,
        title: "Close Battle Tested",
        description: "Play 3 close matches.",
        progress: 2,
        target: 3,
        progressLabel: "close matches",
        unlocked: false,
      },
    ],
    matchHistory: overrides?.matchHistory ?? [],
  };
}

describe("PlayerHistoryProfile", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
        fetch: typeof fetch;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = mocks.fetch;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.useSession.mockReturnValue({
      data: {
        user: {
          id: "viewer-1",
          name: "Viewer",
        },
      },
      status: "authenticated",
    });
    mocks.deletePlayerAvatar.mockResolvedValue({ avatarUrl: null });
    mocks.uploadPlayerAvatar.mockResolvedValue({ avatarUrl: "https://cdn.test/avatars/new.png" });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderView({
    profileResponse = buildProfileResponse(),
    currentUser = {
      id: "viewer-2",
      isAdmin: false,
      isClaimed: true,
      isQuickAccess: false,
      avatarUrl: null,
      players: [],
    },
    clubId = "",
    readOnly = false,
  }: {
    profileResponse?: ReturnType<typeof buildProfileResponse>;
    currentUser?: {
      id: string;
      isAdmin?: boolean;
      isClaimed?: boolean;
      isQuickAccess?: boolean;
      avatarUrl?: string | null;
      players?: Array<{ id: string }>;
    };
    mode?: "standalone" | "embedded";
    clubId?: string;
    readOnly?: boolean;
  } = {}) {
    mocks.fetch.mockImplementation((input: string | Request | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes("/api/users/player-1/stats")) {
        return Promise.resolve(createJsonResponse(profileResponse));
      }

      if (url === "/api/user/me") {
        return Promise.resolve(
          createJsonResponse({
            user: currentUser,
            players: currentUser.players ?? [],
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    await act(async () => {
      root.render(<PlayerHistoryProfile playerId="player-1" clubId={clubId} readOnly={readOnly} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("keeps retired profile history read-only for owners and club admins", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        isRetired: true,
        context: {
          clubId: "club-1",
          viewerCanManageClub: true,
          canAddGuestToClub: true,
          rankContext: {
            leaderboardSize: 4,
            currentRank: null,
            previousRank: null,
            rankDelta: null,
          },
        },
      }),
      currentUser: {
        id: "account-owner",
        isAdmin: true,
        isClaimed: true,
        isQuickAccess: false,
        avatarUrl: null,
        players: [{ id: "player-1" }],
      },
    });

    expect(container.querySelector('button[aria-label="Change profile photo for Alex Lee"]')).toBeNull();
    expect(container.textContent).not.toContain("Adjust rating");
    expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent?.trim() === "Add to club")).toBe(false);
  });

  it("uses owned Player IDs to manage a profile photo, never the account ID", async () => {
    await renderView({
      clubId: "club-1",
      currentUser: {
        id: "account-1",
        isAdmin: false,
        isClaimed: true,
        isQuickAccess: false,
        avatarUrl: null,
        players: [{ id: "player-1" }],
      },
    });

    const avatarMenuButton = container.querySelector(
      'button[aria-label="Change profile photo for Alex Lee"]'
    ) as HTMLButtonElement | null;
    await act(async () => {
      avatarMenuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const removeButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Remove"
    );
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.deletePlayerAvatar).toHaveBeenCalledWith("player-1", "club-1");
  });

  it("does not treat a matching account ID as ownership of a Player", async () => {
    await renderView({
      currentUser: {
        id: "player-1",
        isAdmin: false,
        isClaimed: true,
        isQuickAccess: false,
        avatarUrl: null,
        players: [],
      },
    });

    expect(
      container.querySelector('button[aria-label="Change profile photo for Alex Lee"]')
    ).toBeNull();
  });
  it("preserves exact participant context and read-only navigation", async () => {
    const profileResponse = buildProfileResponse({ matchHistory: [buildMatch("context", { partner: { id: "exact", name: "Exact partner", avatarUrl: null, profileClubId: "club-a" }, opponents: [{ id: "uncertain", name: "Uncertain opponent", avatarUrl: null, profileClubId: null }] })] });
    await renderView({ clubId: "viewer-club", profileResponse, readOnly: true });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-profile-match]")!.click());
    const hrefFor = (name: string) => Array.from(container.querySelectorAll("a")).find(link => link.textContent === name)?.getAttribute("href");
    expect(hrefFor("Exact partner")).toBe("/profile/exact?clubId=club-a&view=global");
    expect(hrefFor("Uncertain opponent")).toBe("/profile/uncertain?view=global");
    expect(container.textContent).not.toContain("Adjust rating");
    expect(container.textContent).not.toContain("Add to club");
  });
});
