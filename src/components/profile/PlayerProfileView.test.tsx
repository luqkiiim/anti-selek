// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUserAvatar: vi.fn(),
  fetch: vi.fn(),
  router: {
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  uploadUserAvatar: vi.fn(),
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
  deleteUserAvatar: mocks.deleteUserAvatar,
  uploadUserAvatar: mocks.uploadUserAvatar,
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
  };
  opponents: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
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
  context: {
    clubId: string;
    viewerCanManageClub: boolean;
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
      id: "user-1",
      name,
      avatarUrl,
      elo: 1320,
      createdAt: "2026-05-01T00:00:00.000Z",
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
      best: [],
    },
    opponents: {
      toughest: [],
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
    },
    mode = "standalone",
  }: {
    profileResponse?: ReturnType<typeof buildProfileResponse>;
    currentUser?: {
      id: string;
      isAdmin?: boolean;
      isClaimed?: boolean;
      isQuickAccess?: boolean;
      avatarUrl?: string | null;
    };
    mode?: "standalone" | "embedded";
  } = {}) {
    mocks.fetch.mockImplementation((input: string | Request | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes("/api/users/user-1/stats")) {
        return Promise.resolve(createJsonResponse(profileResponse));
      }

      if (url === "/api/user/me") {
        return Promise.resolve(
          createJsonResponse({
            user: currentUser,
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    await act(async () => {
      root.render(<PlayerProfileView userId="user-1" mode={mode} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

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
    expect(document.body.textContent).toContain("Up 2");
    expect(document.body.textContent).toContain("+10 rating");

    expect(document.body.textContent).not.toContain("Rating story");
    expect((document.body.textContent?.match(/Rank #4/g) ?? []).length).toBe(0);
    expect((document.body.textContent?.match(/Club rating/g) ?? []).length).toBe(1);
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

  it("shows avatars only in the overview recent matches rows", async () => {
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
    expect(document.body.textContent).toContain("Haziq Azman");
    expect(document.body.textContent).toContain("Daniel Nabil");
    expect(document.body.textContent).toContain("Khairul Zaim Longname");
    expect(container.querySelector('img[alt="Haziq Azman avatar"]')).toBeTruthy();
    expect(container.querySelector('img[alt="Daniel Nabil avatar"]')).toBeTruthy();
    expect(
      container.querySelector('img[alt="Khairul Zaim Longname avatar"]')
    ).toBeTruthy();

    const matchesTab = Array.from(
      container.querySelectorAll('button[role="tab"]')
    ).find((button) => button.textContent === "Matches");
    expect(matchesTab).toBeTruthy();

    await act(async () => {
      matchesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Khairul Zaim Longname");
    expect(container.querySelector('img[alt="Haziq Azman avatar"]')).toBeNull();
    expect(container.querySelector('img[alt="Daniel Nabil avatar"]')).toBeNull();
    expect(
      container.querySelector('img[alt="Khairul Zaim Longname avatar"]')
    ).toBeNull();
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
    expect(document.body.textContent).toContain("Session form");
    expect(document.body.textContent).toContain("3-1");
    expect(document.body.textContent).toContain("+24 diff");
    expect(document.body.textContent).toContain("+18 rating");
    expect(document.body.textContent).toContain("1-3");
    expect(document.body.textContent).toContain("-14 diff");
    expect(document.body.textContent).toContain("-11 rating");

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

  it("does not show the long avatar upload helper text for admins", async () => {
    await renderView({
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
      currentUser: {
        id: "user-1",
        isAdmin: false,
        isClaimed: true,
        isQuickAccess: false,
        avatarUrl: null,
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
});
