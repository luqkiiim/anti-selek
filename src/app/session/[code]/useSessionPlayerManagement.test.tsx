// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeJson } from "@/lib/http";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
  SessionScoringType,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import type { ClubUser, SessionData } from "@/components/session/sessionTypes";
import { useSessionPlayerManagement } from "./useSessionPlayerManagement";

const safeJson: SafeJson = async <T,>(response: Response) =>
  (await response.json()) as T;

function createSessionData(
  overrides: Partial<SessionData> = {}
): SessionData {
  return {
    id: "session-1",
    code: "ABC",
    clubId: "club-a",
    name: "Club session",
    type: SessionType.POINTS,
    mode: SessionMode.MEXICANO,
    collabFormat: SessionCollabFormat.FREE_PLAY,
    scoringType: SessionScoringType.POINTS,
    matchmakingStyle: SessionMatchmakingStyle.BALANCED,
    balanceMetric: SessionBalanceMetric.SESSION_POINTS,
    pairingMode: SessionPairingMode.OPEN,
    status: SessionStatus.WAITING,
    isTest: false,
    autoQueueEnabled: false,
    respectPlayerRest: true,
    poolsEnabled: false,
    poolAName: null,
    poolBName: null,
    poolACourtAssignments: 0,
    poolBCourtAssignments: 0,
    poolAMissedTurns: 0,
    poolBMissedTurns: 0,
    crossoverMissThreshold: 1,
    courts: [],
    players: [],
    ...overrides,
  };
}

const interclubPlayer: ClubUser = {
  id: "club-b-player",
  name: "Club B Player",
  avatarUrl: null,
  elo: 1110,
  status: ClubPlayerStatus.CORE,
  needsMoreRest: false,
  representingClubId: "club-b",
  representingClubName: "Anti-SeleK",
  gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN,
  mixedSideOverride: null,
};

function Harness({
  sessionData,
  playerToAdd,
}: {
  sessionData: SessionData;
  playerToAdd?: ClubUser;
}) {
  const manager = useSessionPlayerManagement({
    code: "ABC",
    sessionData,
    safeJson,
    patchSessionData: vi.fn(),
    scheduleSessionRefresh: vi.fn(),
    setError: vi.fn(),
  });

  return (
    <>
      <button type="button" id="open" onClick={manager.openRosterModal}>
        Open
      </button>
      <button
        type="button"
        id="add"
        onClick={() => {
          if (playerToAdd) {
            void manager.addPlayerToSession(playerToAdd);
          }
        }}
      >
        Add
      </button>
      <span id="player-count">{manager.clubPlayers.length}</span>
    </>
  );
}

describe("useSessionPlayerManagement", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("loads the session roster for interclub sessions", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([interclubPlayer]), { status: 200 })
    );

    await act(async () => {
      root.render(
        <Harness
          sessionData={createSessionData({
            collabFormat: SessionCollabFormat.INTERCLUB,
          })}
        />
      );
    });

    await act(async () => {
      document.getElementById("open")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/ABC/roster");
    expect(document.getElementById("player-count")?.textContent).toBe("1");
  });

  it("keeps using the club members endpoint for non-interclub sessions", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([interclubPlayer]), { status: 200 })
    );

    await act(async () => {
      root.render(<Harness sessionData={createSessionData()} />);
    });

    await act(async () => {
      document.getElementById("open")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/clubs/club-a/members");
  });

  it("sends the represented club when adding an interclub roster player", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ players: [] }), { status: 200 })
    );

    await act(async () => {
      root.render(
        <Harness
          sessionData={createSessionData({
            collabFormat: SessionCollabFormat.INTERCLUB,
          })}
          playerToAdd={interclubPlayer}
        />
      );
    });

    await act(async () => {
      document.getElementById("add")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/ABC/join",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          userId: "club-b-player",
          pool: SessionPool.A,
          representingClubId: "club-b",
        }),
      })
    );
  });
});
