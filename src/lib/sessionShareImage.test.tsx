import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { MatchStatus, SessionType } from "@/types/enums";
import {
  buildSessionShareImageViewModel,
  fetchShareImageAvatarDataUrls,
  renderSessionShareImage,
} from "./sessionShareImage";

function createPlayers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    userId: `u${index + 1}`,
    sessionPoints: 40 - index,
    isGuest: false,
    user: {
      name: `P${String(index + 1).padStart(2, "0")}`,
      avatarUrl: null,
    },
  }));
}

describe("session share image", () => {
  it("renders top 14 with podium ranks 1-3 and rows 4-14 only", () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: createPlayers(15),
      matches: [],
    });
    const markup = renderToStaticMarkup(renderSessionShareImage(viewModel));

    expect(viewModel.standings).toHaveLength(14);
    expect(viewModel.omittedPlayerCount).toBe(1);
    expect(markup).toContain("Weekend Cup");
    expect(markup).toContain("1 more player not shown");
    expect(markup).toContain("Player");
    expect(markup).toContain("Pts");
    expect(markup).toContain("Diff");
    expect(markup).toContain("MP");
    expect(markup).toContain("W/L");
    expect(markup).toContain(">14<");
    expect(markup).not.toContain(">15<");
    expect(markup.match(/P01/g) ?? []).toHaveLength(1);
    expect(markup.match(/P02/g) ?? []).toHaveLength(1);
    expect(markup.match(/P03/g) ?? []).toHaveLength(1);
  });

  it("keeps a truthful empty state and centers a single podium winner", () => {
    const emptyMarkup = renderToStaticMarkup(renderSessionShareImage(buildSessionShareImageViewModel({
      sessionName: "Quiet day", clubName: "Club", sessionType: SessionType.POINTS, players: [], matches: [],
    })));
    const onePlayerMarkup = renderToStaticMarkup(renderSessionShareImage(buildSessionShareImageViewModel({
      sessionName: "Quiet day", clubName: "Club", sessionType: SessionType.POINTS, players: createPlayers(1), matches: [],
    })));
    expect(emptyMarkup).toContain("No standings available");
    expect(emptyMarkup).toContain("0 players");
    expect(onePlayerMarkup).toContain("P01");
    expect(onePlayerMarkup).toContain("flex:0 0 52%");
  });

  it("uses session points, wins, losses, and point diff for points standings", () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: [
        { userId: "u1", sessionPoints: 10, user: { name: "Aiman" } },
        { userId: "u2", sessionPoints: 10, user: { name: "Haziq" } },
        { userId: "u3", sessionPoints: 8, user: { name: "Siti" } },
        { userId: "u4", sessionPoints: 8, user: { name: "Mira" } },
      ],
      matches: [
        {
          team1User1Id: "u1",
          team1User2Id: "u3",
          team2User1Id: "u2",
          team2User2Id: "u4",
          team1Score: 21,
          team2Score: 17,
          winnerTeam: 1,
      status: MatchStatus.COMPLETED,
        },
      ],
    });

    expect(viewModel.standings[0]).toMatchObject({
      userId: "u1",
      pointDiff: 4,
      wins: 1,
      losses: 0,
      score: 10,
      matchesPlayed: 1,
    });
    expect(viewModel.standings[1]).toMatchObject({
      userId: "u2",
      pointDiff: -4,
      wins: 0,
      losses: 1,
      score: 10,
      matchesPlayed: 1,
    });
  });

  it("renders avatar initials when no avatar data URL is available", () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: [{ userId: "u1", sessionPoints: 10, user: { name: "Lina Kay" } }],
      matches: [],
    });
    const markup = renderToStaticMarkup(renderSessionShareImage(viewModel));

    expect(markup).toContain(">LK<");
    expect(markup).not.toContain("<img");
  });

  it("renders enlarged podium and row avatar images when data URLs are available", () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: createPlayers(4),
      matches: [],
    });
    const markup = renderToStaticMarkup(
      renderSessionShareImage(
        viewModel,
        new Map([
          ["u1", "data:image/png;base64,cG9kaXVt"],
          ["u4", "data:image/png;base64,cm93"],
        ])
      )
    );

    expect(markup).toMatch(
      /alt="P01 avatar"[^>]*width="230"[^>]*height="230"/
    );
    expect(markup).toMatch(
      /alt="P04 avatar"[^>]*width="78"[^>]*height="78"/
    );
    expect(markup).toContain("width:230px;height:230px");
    expect(markup).toContain("width:78px;height:78px");
  });

  it("fetches avatar data URLs best-effort and skips failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Blob(["avatar"], { type: "image/png" }), {
          headers: {
            "content-type": "image/png",
            "content-length": "6",
          },
        })
      )
      .mockRejectedValueOnce(new Error("network"));

    const avatarMap = await fetchShareImageAvatarDataUrls(
      [
        {
          rank: 1,
          userId: "u1",
          name: "Lina",
          initials: "L",
          avatarUrl: "https://cdn.test/lina.png",
          isGuest: false,
          score: 12,
          scoreLabel: "Points",
          wins: 3,
          losses: 1,
          pointDiff: 7,
          matchesPlayed: 4,
        },
        {
          rank: 2,
          userId: "u2",
          name: "Zaim",
          initials: "Z",
          avatarUrl: "https://cdn.test/zaim.png",
          isGuest: false,
          score: 10,
          scoreLabel: "Points",
          wins: 2,
          losses: 2,
          pointDiff: 1,
          matchesPlayed: 4,
        },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(avatarMap.get("u1")).toMatch(/^data:image\/png;base64,/);
    expect(avatarMap.has("u2")).toBe(false);
  });

  it("converts WebP avatars to PNG data URLs that next/og can render", async () => {
    const webpBytes = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 15, g: 118, b: 110, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Blob([new Uint8Array(webpBytes)], { type: "image/webp" }), {
        headers: {
          "content-type": "image/webp",
          "content-length": String(webpBytes.byteLength),
        },
      })
    );

    const avatarMap = await fetchShareImageAvatarDataUrls(
      [
        {
          rank: 1,
          userId: "u1",
          name: "Lina",
          initials: "L",
          avatarUrl: "https://cdn.test/lina.webp",
          isGuest: false,
          score: 12,
          scoreLabel: "Points",
          wins: 3,
          losses: 1,
          pointDiff: 7,
          matchesPlayed: 4,
        },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(avatarMap.get("u1")).toMatch(/^data:image\/png;base64,/);

    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: [{ userId: "u1", sessionPoints: 12, user: { name: "Lina" } }],
      matches: [],
    });
    const response = new ImageResponse(
      renderSessionShareImage(viewModel, avatarMap),
      { width: 1080, height: 1920 }
    );

    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1_000);
  });
});
