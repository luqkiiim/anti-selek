import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
  it("renders top 13 with podium ranks 1-3 and rows 4-13 only", () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: createPlayers(14),
      matches: [],
    });
    const markup = renderToStaticMarkup(renderSessionShareImage(viewModel));

    expect(viewModel.standings).toHaveLength(13);
    expect(markup).toContain("Final standings");
    expect(markup).not.toContain("Positions 4-11");
    expect(markup).not.toContain("Top 11 snapshot");
    expect(markup).toContain(">1<");
    expect(markup).toContain(">13<");
    expect(markup).not.toContain("P14");
    expect(markup.match(/P01/g) ?? []).toHaveLength(1);
    expect(markup.match(/P02/g) ?? []).toHaveLength(1);
    expect(markup.match(/P03/g) ?? []).toHaveLength(1);
  });

  it("uses one wide lower column until more than eight players are shown", () => {
    const eightPlayerMarkup = renderToStaticMarkup(
      renderSessionShareImage(
        buildSessionShareImageViewModel({
          sessionName: "Weekend Cup",
          clubName: "Badminton Usuals",
          sessionType: SessionType.POINTS,
          players: createPlayers(8),
          matches: [],
        })
      )
    );
    const ninePlayerMarkup = renderToStaticMarkup(
      renderSessionShareImage(
        buildSessionShareImageViewModel({
          sessionName: "Weekend Cup",
          clubName: "Badminton Usuals",
          sessionType: SessionType.POINTS,
          players: createPlayers(9),
          matches: [],
        })
      )
    );

    expect(eightPlayerMarkup).toContain("width:896px");
    expect(eightPlayerMarkup).not.toContain("width:438px");
    expect(ninePlayerMarkup).toContain("width:438px");
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
    });
    expect(viewModel.standings[1]).toMatchObject({
      userId: "u2",
      pointDiff: -4,
      wins: 0,
      losses: 1,
      score: 10,
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
      /alt="P01 avatar"[^>]*width="136"[^>]*height="136"/
    );
    expect(markup).toMatch(
      /alt="P04 avatar"[^>]*width="92"[^>]*height="92"/
    );
    expect(markup).toContain("width:136px;height:136px");
    expect(markup).toContain("width:92px;height:92px");
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
        },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(avatarMap.get("u1")).toMatch(/^data:image\/png;base64,/);
    expect(avatarMap.has("u2")).toBe(false);
  });
});
