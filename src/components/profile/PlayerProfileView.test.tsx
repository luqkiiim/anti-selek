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

vi.mock("@/components/prototype/Primitives", () => ({
  Sheet: ({ open = true, title, children, onClose }: {
    open?: boolean; title: string; children: React.ReactNode; onClose: () => void;
  }) => open ? <div role="dialog" aria-label={title}>{children}<button aria-label="Close" onClick={onClose}>Close</button></div> : null,
}));

import { PlayerProfileView } from "./PlayerProfileView";

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
    recentSessions: overrides?.recentSessions ?? [],
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

function buildConnection(
  id: string,
  name: string,
  wins: number,
  losses: number,
  avatarUrl: string | null = `https://cdn.test/avatars/${id}.jpg`
) {
  const matches = wins + losses;

  return {
    user: {
      id,
      name,
      avatarUrl,
    },
    matches,
    wins,
    losses,
    winRate: matches > 0 ? Math.round((wins / matches) * 100) : 0,
    pointDifferential: wins * 3 - losses * 4,
    ratingChange: wins - losses,
  };
}

describe("PlayerProfileView", () => {
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
    mode = "standalone",
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
      root.render(<PlayerProfileView playerId="player-1" mode={mode} clubId={clubId} readOnly={readOnly} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("links historical and relationship participants to exact local context or an unscoped profile", async () => {
    const profileResponse = buildProfileResponse({ matchHistory: [buildMatch("context-match", {
      partner: { id: "exact", name: "Exact partner", avatarUrl: null, profileClubId: "club-a" },
      opponents: [
        { id: "uncertain", name: "Uncertain opponent", avatarUrl: null, profileClubId: null },
        { id: "legacy", name: "Legacy opponent", avatarUrl: null },
      ],
    })] });
    profileResponse.partners.best = [{ user: { id: "summary-exact", name: "Exact summary", profileClubId: "club-a" }, matches: 1, wins: 1, losses: 0, winRate: 100, pointDifferential: 2, ratingChange: 0 }];
    profileResponse.opponents.toughest = [{ user: { id: "summary-mixed", name: "Mixed summary", profileClubId: null }, matches: 2, wins: 1, losses: 1, winRate: 50, pointDifferential: 0, ratingChange: 0 }];
    await renderView({ clubId: "viewer-club", profileResponse });
    await act(async () => { container.querySelector<HTMLButtonElement>("[data-profile-match]")!.click(); });
    const hrefFor = (name: string) => Array.from(container.querySelectorAll("a")).find((link) => link.textContent === name)?.getAttribute("href");
    expect(hrefFor("Exact partner")).toBe("/profile/exact?clubId=club-a");
    expect(hrefFor("Uncertain opponent")).toBe("/profile/uncertain");
    expect(hrefFor("Legacy opponent")).toBe("/profile/legacy?clubId=viewer-club");
    expect(container.querySelector('a[aria-label="View Exact summary’s profile"]')?.getAttribute("href")).toBe("/profile/summary-exact?clubId=club-a");
    expect(container.querySelector('a[aria-label="View Mixed summary’s profile"]')?.getAttribute("href")).toBe("/profile/summary-mixed");
  });

  it("opens and closes an enlarged profile photo from the read-only hero avatar", async () => {
    await renderView();

    const previewButton = container.querySelector(
      'button[aria-label="View profile photo of Alex Lee"]'
    ) as HTMLButtonElement | null;
    expect(previewButton).toBeTruthy();
    expect(previewButton?.className).toContain("aspect-square");
    expect(previewButton?.className).toContain("rounded-full");

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Alex Lee photo");
    const enlargedImage = document.body.querySelector(
      'img[alt="Alex Lee profile photo"]'
    ) as HTMLImageElement | null;
    expect(enlargedImage?.getAttribute("src")).toBe(
      "https://cdn.test/avatars/alex.jpg"
    );

    const closeButton = document.body.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("Alex Lee photo");
    expect(
      document.body.querySelector('img[alt="Alex Lee profile photo"]')
    ).toBeNull();
  });

  it("does not render a viewer trigger when the player has no uploaded photo", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        avatarUrl: null,
      }),
    });

    expect(
      container.querySelector('button[aria-label="View profile photo of Alex Lee"]')
    ).toBeNull();
  });

  it("keeps the hero as avatar-left and profile-info-right on mobile widths", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        name: "Alexandria Lee Rahman",
      }),
    });

    const heroBody = container.querySelector(
      '[data-testid="profile-hero-body"]'
    );
    const heroTitle = container.querySelector(
      '[data-testid="profile-hero-title"]'
    );

    expect(heroBody?.className).toContain(
      "grid-cols-[6rem_minmax(0,1fr)]"
    );
    expect(heroBody?.className).toContain(
      "sm:grid-cols-[auto_minmax(0,1fr)]"
    );
    expect(heroTitle?.className).toContain("break-words");
    expect(heroTitle?.className).not.toContain("truncate");
  });

  it("does not reserve back-button toolbar space in embedded club profile mode", async () => {
    await renderView({ mode: "embedded" });

    expect(
      container.querySelector('button[aria-label="Go back"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="profile-hero-body"]')
    ).toBeTruthy();
  });

  it("keeps the back button on standalone profile pages", async () => {
    await renderView();

    expect(
      container.querySelector('button[aria-label="Go back"]')
    ).toBeTruthy();
  });

  it("renders concrete permanent achievement badges with exact progress", async () => {
    await renderView();

    expect(document.body.textContent).toContain("Strong Start");
    expect(document.body.textContent).toContain("2/2");
    expect(document.body.textContent).toContain("Close Battle Tested");
    expect(document.body.textContent).toContain("2/3");
    expect(document.body.textContent).not.toContain("Unlocked in Friday Session");
    expect(document.body.textContent).not.toContain(
      "Win your first 2 matches."
    );
    expect(document.body.textContent).not.toContain(
      "Play 3 close matches."
    );
    expect(document.body.textContent).not.toContain("Locked");
    expect(document.body.textContent).not.toContain("Hot streak");
    expect(document.body.textContent).not.toContain("Rival tested");
    expect(document.body.textContent).not.toContain("Partner chemistry");

    const strongStartButton = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent?.includes("Strong Start"));
    expect(strongStartButton).toBeTruthy();

    await act(async () => {
      strongStartButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Win your first 2 matches.");
    expect(document.body.textContent).not.toContain("How to earn");
  });

  it("keeps achievement descriptions on the full achievements tab", async () => {
    await renderView();

    const achievementsTab = Array.from(
      container.querySelectorAll('button[role="tab"]')
    ).find((button) => button.textContent === "Achievements");
    expect(achievementsTab).toBeTruthy();

    await act(async () => {
      achievementsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Win your first 2 matches.");
    expect(document.body.textContent).toContain("Play 3 close matches.");
    expect(document.body.textContent).not.toContain("Locked");
    expect(document.body.textContent).not.toContain("Unlocked in Friday Session");
  });

  it("uses a single rating snapshot without duplicating hero rating or rank chips", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        context: {
          clubId: "community-1",
          viewerCanManageClub: false,
          rankContext: {
            leaderboardSize: 20,
            currentRank: 4,
            previousRank: 6,
            rankDelta: 2,
          },
        },
      }),
    });

    const snapshot = container.querySelector(
      '[data-testid="profile-rating-snapshot"]'
    );
    expect(snapshot?.textContent).toContain("Club rating");
    expect(snapshot?.textContent).toContain("1320");
    expect(document.body.textContent).toContain("#4");
    expect(document.body.textContent).toContain("Rank up 2");
    expect(document.body.textContent).toContain("+10 rating");

    expect(document.body.textContent).not.toContain("Rating story");
    expect((document.body.textContent?.match(/Rank #4/g) ?? []).length).toBe(0);
    expect((snapshot?.textContent?.match(/Club rating/g) ?? []).length).toBe(1);
  });

  it("does not render unsupported prototype-only stats or tournament metadata", async () => {
    await renderView();

    expect(document.body.textContent).not.toContain("Playstyle");
    expect(document.body.textContent).not.toContain("Smash win rate");
    expect(document.body.textContent).not.toContain("Defensive win rate");
    expect(document.body.textContent).not.toContain("Errors / match");
    expect(document.body.textContent).not.toContain("R16");
    expect(document.body.textContent).not.toContain("R32");
  });

  it("keeps profile match cards concise and exposes full identities in details", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        matchHistory: [
          buildMatch("match-1", {
            opponents: [
              {
                id: "opponent-1",
                name: "Daniel Nabil",
                avatarUrl: "https://cdn.test/avatars/daniel.jpg",
              },
              {
                id: "opponent-2",
                name: "Khairul Zaim Longname",
                avatarUrl: "https://cdn.test/avatars/khairul.jpg",
              },
            ],
          }),
        ],
      }),
    });

    expect(document.body.textContent).toContain("Recent matches");
    const card = container.querySelector<HTMLButtonElement>("[data-profile-match]")!;
    expect(card.querySelector('[data-team="owner"]')?.textContent).toBe("AlexHaziq");
    expect(card.querySelector('[data-team="opponents"]')?.textContent).toBe("DanielKhairul");
    expect(card.querySelector('[data-score="owner"][data-winner="true"]')?.textContent).toBe("21");
    await act(async () => card.click());
    const details = container.querySelector('[role="dialog"][aria-label="Match details"]')!;
    expect(details.textContent).toContain("Alex Lee & Haziq Azman");
    expect(details.textContent).toContain("Daniel Nabil & Khairul Zaim Longname");
    await act(async () => details.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click());

    const matchesTab = Array.from(
      container.querySelectorAll('button[role="tab"]')
    ).find((button) => button.textContent === "Matches");
    expect(matchesTab).toBeTruthy();

    await act(async () => {
      matchesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-team="opponents"]')?.textContent).toBe("DanielKhairul");
  });

  it("keeps the stats tab to rating ledger and prototype-style session form", async () => {
    await renderView({
      profileResponse: buildProfileResponse({
        recentSessions: [
          buildRecentSession("session-1", {
            date: "2026-05-18T00:00:00.000Z",
            wins: 3,
            losses: 1,
            pointDifferential: 24,
            ratingChange: 18,
          }),
          buildRecentSession("session-2", {
            date: "2026-05-15T00:00:00.000Z",
            wins: 1,
            losses: 3,
            pointDifferential: -14,
            ratingChange: -11,
          }),
        ],
      }),
    });

    const statsTab = Array.from(
      container.querySelectorAll('button[role="tab"]')
    ).find((button) => button.textContent === "Stats");
    expect(statsTab).toBeTruthy();

    await act(async () => {
      statsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Rating ledger");
    expect(document.body.textContent).toContain("Current");
    expect(document.body.textContent).toContain("Peak");
    expect(document.body.textContent).toContain("Lowest");
    expect(document.body.textContent).toContain("30D change");
    expect(document.body.textContent).toContain("Tournament form");
    expect(document.body.textContent).toContain("3-1");
    expect(document.body.textContent).toContain("+24 diff");
    expect(document.body.textContent).toContain("+18 rating");
    expect(document.body.textContent).toContain("1-3");
    expect(document.body.textContent).toContain("-14 diff");
    expect(document.body.textContent).toContain("-11 rating");

    const ratingChart = container.querySelector<HTMLElement>(
      '[data-rating-chart-root="true"]'
    );
    expect(ratingChart?.getAttribute("role")).toBe("slider");
    expect(ratingChart?.getAttribute("tabindex")).toBe("0");
    expect(ratingChart?.getAttribute("aria-valuetext")).toContain("rating");

    await act(async () => {
      ratingChart?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      );
    });
    expect(ratingChart?.getAttribute("aria-valuenow")).toBe("0");

    await act(async () => {
      ratingChart?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(ratingChart?.getAttribute("aria-valuenow")).toBe("1");

    expect(document.body.textContent).not.toContain("Performance");
    expect(document.body.textContent).not.toContain("Partners & opponents");
    expect(document.body.textContent).not.toContain("Trend window");
    expect(document.body.textContent).not.toContain("Session volume");
  });

  it("renders relationship previews and opens group-specific full lists", async () => {
    await renderView({
      profileResponse: {
        ...buildProfileResponse(),
        partners: {
          best: [
            buildConnection("partner-1", "Haziq Azman", 11, 3),
            buildConnection("partner-2", "Farid Iqbal", 7, 4),
            buildConnection("partner-3", "Nabil Rahman", 6, 3),
            buildConnection("partner-4", "Syafiq Halim", 5, 4),
          ],
        },
        opponents: {
          toughest: [
            buildConnection("opponent-1", "Zaki Rahim", 2, 5),
            buildConnection("opponent-2", "Khairul Zaim", 3, 4),
            buildConnection("opponent-3", "Arif Hakim", 2, 4),
            buildConnection("opponent-4", "Hafiz Omar", 2, 3),
          ],
        },
      },
    });

    expect(document.body.textContent).toContain("Partners & opponents");
    expect(document.body.textContent).toContain("#1");
    expect(document.body.textContent).toContain("Haziq Azman");
    expect(document.body.textContent).toContain("11W/3L");
    expect(document.body.textContent).toContain("79%");
    expect(document.body.textContent).toContain("Zaki Rahim");
    expect(document.body.textContent).toContain("2W/5L");
    expect(document.body.textContent).not.toContain("Syafiq Halim");

    const partnerViewAll = container.querySelector(
      'button[aria-label="View all Best partners"]'
    ) as HTMLButtonElement | null;
    expect(partnerViewAll).toBeTruthy();

    await act(async () => {
      partnerViewAll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Syafiq Halim");
    expect(document.body.textContent).toContain("5W/4L");

    const closeButton = document.body.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("Syafiq Halim");
  });

  it("shows only the selected relationship's matches from the profile owner's perspective", async () => {
    const response = buildProfileResponse({ matchHistory: [
      ...Array.from({ length: 12 }, (_, index) => ({
        ...buildMatch(`together-${index}`),
        date: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`, sessionName: `Together ${index + 1}`,
      })),
      { ...buildMatch("against", {
        partner: { id: "another", name: "Another", avatarUrl: null },
        opponents: [{ id: "partner-1", name: "Haziq Azman", avatarUrl: null }], result: "LOSS", score: "16-21",
      }), sessionName: "Against Haziq" },
      { ...buildMatch("different-id", { partner: { id: "lookalike", name: "Haziq Azman", avatarUrl: null } }), sessionName: "Different player" },
    ] });
    response.partners.best = [buildConnection("partner-1", "Haziq Azman", 12, 0)];
    response.opponents.toughest = [buildConnection("partner-1", "Haziq Azman", 0, 1)];
    await renderView({ profileResponse: response });
    const click = async (element: Element | null | undefined) => {
      expect(element).toBeTruthy();
      await act(async () => { element!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    };
    const getDialog = (title: string) => container.querySelector(`[role="dialog"][aria-label="${title}"]`)!;
    await click(container.querySelector('button[aria-label="Matches with Haziq Azman"] span'));
    let history = getDialog("With Haziq");
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(10);
    expect(history.querySelector("[data-profile-match]")?.getAttribute("aria-label")).toContain("Together 12");
    expect(history.textContent).not.toContain("Against Haziq");
    expect(history.textContent).not.toContain("Different player");
    await click(history.querySelector("[data-profile-match]"));
    const details = getDialog("Match details");
    expect(details.querySelector('a[href="/session/session-1/history"]')).toBeTruthy();
    expect(details.textContent).toContain("Alex Lee & Haziq Azman");
    await click(details.querySelector('button[aria-label="Close"]'));
    await click(Array.from(history.querySelectorAll("button")).find(node => node.textContent === "Load more"));
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(12);
    await click(history.querySelector('button[aria-label="Close"]'));
    await click(container.querySelector('button[aria-label="Matches with Haziq Azman"]'));
    history = getDialog("With Haziq");
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(10);
    await click(history.querySelector('button[aria-label="Close"]'));
    await click(container.querySelector('button[aria-label="Matches against Haziq Azman"] svg'));
    const against = getDialog("Against Haziq");
    expect(against.querySelectorAll("[data-profile-match]")).toHaveLength(1);
    expect(against.textContent).toContain("Against Haziq");
    expect(against.querySelector('[data-score="owner"]')?.textContent).toBe("16");
    expect(against.querySelector('[data-score="opponent"][data-winner="true"]')?.textContent).toBe("21");
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("preserves View all beneath history and navigates through the photo with read-only club context", async () => {
    const response = buildProfileResponse();
    response.partners.best = Array.from({ length: 4 }, (_, index) => buildConnection(`p-${index}`, `Partner ${index}`, 4, 1));
    const click = async (element: Element | null) => {
      expect(element).toBeTruthy();
      await act(async () => { element!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    };
    await renderView({ profileResponse: response, clubId: "club-a", readOnly: true });
    await click(container.querySelector('button[aria-label="View all Best partners"]'));
    const list = container.querySelector('[role="dialog"][aria-label="Best partners list"]')!;
    await click(list.querySelector('button[aria-label="Matches with Partner 3"]'));
    const history = container.querySelector('[role="dialog"][aria-label="With Partner"]')!;
    expect(history.textContent).toContain("No matches found.");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(container.querySelector('[aria-label="Best partners list"]')).toBe(list);
    await click(history.querySelector('button[aria-label="Close"]'));
    const photo = list.querySelector('a[aria-label="View Partner 3’s profile"]');
    expect(photo?.getAttribute("href")).toBe("/profile/p-3?clubId=club-a&view=global");
    await click(photo);
    expect(container.querySelector('[aria-label="Best partners list"]')).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/profile/p-3?clubId=club-a&view=global", { scroll: false });
    expect(container.querySelector("button button")).toBeNull();
  });

  it("does not show the long avatar upload helper text for admins", async () => {
    await renderView({
      clubId: "club-1",
      currentUser: {
        id: "viewer-1",
        isAdmin: true,
        isClaimed: true,
        isQuickAccess: false,
        avatarUrl: null,
      },
    });

    expect(document.body.textContent).not.toContain(
      "Choose a JPG, PNG, or WebP photo"
    );
    expect(document.body.textContent).not.toContain("Replace photo");

    const avatarMenuButton = container.querySelector(
      'button[aria-label="Change profile photo for Alex Lee"]'
    ) as HTMLButtonElement | null;
    expect(avatarMenuButton).toBeTruthy();

    await act(async () => {
      avatarMenuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Change photo");
    expect(document.body.textContent).toContain("View photo");
    expect(document.body.textContent).toContain("Remove");
  });

  it("opens the enlarged photo viewer from the editable self avatar menu", async () => {
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
    expect(avatarMenuButton).toBeTruthy();

    await act(async () => {
      avatarMenuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("View photo");
    expect(document.body.textContent).toContain("Change photo");
    expect(document.body.textContent).toContain("Remove");

    const viewPhotoButton = Array.from(
      document.body.querySelectorAll("button")
    ).find((button) => button.textContent?.trim() === "View photo");
    expect(viewPhotoButton).toBeTruthy();

    await act(async () => {
      viewPhotoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Alex Lee photo");
    const enlargedImage = document.body.querySelector(
      'img[alt="Alex Lee profile photo"]'
    ) as HTMLImageElement | null;
    expect(enlargedImage?.getAttribute("src")).toBe(
      "https://cdn.test/avatars/alex.jpg"
    );
    expect(document.body.textContent).not.toContain("View photo");
  });

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

  it("does not expose the retired legacy access-restoration flow from a manageable profile", async () => {
    await renderView({
      clubId: "club-1",
      profileResponse: buildProfileResponse({
        context: {
          clubId: "club-1",
          viewerCanManageClub: true,
          rankContext: { leaderboardSize: 4, currentRank: null, previousRank: null, rankDelta: null },
        },
      }),
    });

    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("identity-options"))).toBe(false);
    expect(container.querySelector('[aria-label="Restore access to an owned Player"]')).toBeNull();
    expect(container.textContent).not.toContain("archived-member");
    expect(container.textContent).not.toContain("Exact Account");
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
});
