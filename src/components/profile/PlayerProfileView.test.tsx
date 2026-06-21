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
  name: string;
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
    recentSessions: [],
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
        description: "Win your first 2 matches in a completed session.",
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
        description: "Play 3 matches in one session decided by 3 points or less.",
        progress: 2,
        target: 3,
        progressLabel: "close matches",
        unlocked: false,
      },
    ],
    matchHistory: [],
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
  }: {
    profileResponse?: ReturnType<typeof buildProfileResponse>;
    currentUser?: {
      id: string;
      isAdmin?: boolean;
      isClaimed?: boolean;
      isQuickAccess?: boolean;
      avatarUrl?: string | null;
    };
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
      root.render(<PlayerProfileView userId="user-1" mode="standalone" />);
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

  it("renders concrete permanent achievement badges with exact progress", async () => {
    await renderView();

    expect(document.body.textContent).toContain("Strong Start");
    expect(document.body.textContent).toContain("2/2 wins");
    expect(document.body.textContent).toContain("Unlocked in Friday Session");
    expect(document.body.textContent).toContain("Close Battle Tested");
    expect(document.body.textContent).toContain("2/3 close matches");
    expect(document.body.textContent).not.toContain("Hot streak");
    expect(document.body.textContent).not.toContain("Rival tested");
    expect(document.body.textContent).not.toContain("Partner chemistry");
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
    expect(snapshot?.textContent).toContain("#4");
    expect(snapshot?.textContent).toContain("Up 2");
    expect(snapshot?.textContent).toContain("+10 recent rating");

    expect(document.body.textContent).not.toContain("Rating story");
    expect((document.body.textContent?.match(/Rank #4/g) ?? []).length).toBe(0);
    expect((document.body.textContent?.match(/Club rating/g) ?? []).length).toBe(1);
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
    expect(document.body.textContent).toContain("Replace photo");
  });
});
