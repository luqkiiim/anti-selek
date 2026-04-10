import { expect, type Page } from "@playwright/test";
import { PlayerGender, SessionMode, SessionType } from "../src/types/enums";

export const adminCredentials = {
  email: "admin-e2e@example.com",
  password: "Password123!",
};
const adminPlayerName = "Admin E2E";

export const claimRequesterCredentials = {
  email: "claim-requester@example.com",
  password: "Password123!",
};

export const adminUserId = "user-admin-e2e";
export const hostCommunityId = "community-host-e2e";
export const adminControlsCommunityId = "community-admin-controls-e2e";
export const claimCommunityId = "community-claim-e2e";
export const claimRequesterUserId = "user-claim-requester-e2e";
export const claimPlaceholderUserId = "user-claim-placeholder-e2e";
export const scoreSessionCode = "session-score-e2e";

interface SessionPlayerSnapshot {
  userId: string;
  sessionPoints: number;
  isGuest: boolean;
  gender: PlayerGender;
  user: {
    name: string;
  };
}

interface SessionMatchSnapshot {
  status: string;
}

interface CommunityMemberSnapshot {
  id: string;
  name: string;
  elo: number;
}

interface CommunitySessionSnapshot {
  code: string;
  name: string;
  status: string;
}

interface CommunityClaimRequestSnapshot {
  id: string;
  requesterUserId: string;
  requesterName: string;
  targetUserId: string;
  targetName: string;
  status: string;
}

interface SessionCourtSnapshot {
  currentMatch: null | {
    team1User1: { id: string; name: string };
    team1User2: { id: string; name: string };
    team2User1: { id: string; name: string };
    team2User2: { id: string; name: string };
  };
}

export interface SessionSnapshot {
  players: SessionPlayerSnapshot[];
  matches?: SessionMatchSnapshot[];
  courts: SessionCourtSnapshot[];
}

export type CommunityMembersSnapshot = CommunityMemberSnapshot[];
export type CommunitySessionsSnapshot = CommunitySessionSnapshot[];
export type CommunityClaimRequestsSnapshot = CommunityClaimRequestSnapshot[];

export function getHostPlayerCredentials(index: number) {
  return {
    email: `host-player-${index}@example.com`,
    password: "Password123!",
  };
}

export async function signIn(page: Page, credentials: { email: string; password: string }) {
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function signInAsAdmin(page: Page) {
  await signIn(page, adminCredentials);
}

export async function signInAsClaimRequester(page: Page) {
  await signIn(page, claimRequesterCredentials);
}

export async function createStartedHostSession(
  page: Page,
  {
    sessionName,
    courtCount = 1,
    selectedPlayerNames,
    sessionType = SessionType.POINTS,
    sessionMode = SessionMode.MEXICANO,
  }: {
    sessionName: string;
    courtCount?: number;
    selectedPlayerNames?: string[];
    sessionType?: SessionType;
    sessionMode?: SessionMode;
  }
) {
  await page.goto(`/community/${hostCommunityId}`);
  await expect(
    page.getByRole("heading", { name: "E2E Host Club" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Open Host Setup" }).click();
  await page.getByLabel("Name").fill(sessionName);
  await page
    .getByRole("button", {
      name: getSessionTypeButtonName(sessionType),
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: getSessionModeButtonName(sessionMode),
      exact: true,
    })
    .click();
  await page.locator("select").selectOption(String(courtCount));

  await page.getByRole("button", { name: "Choose" }).click();
  const playersModal = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Add Players" }) });
  await expect(playersModal.getByRole("heading", { name: "Add Players" })).toBeVisible();

  const playerNamesToSelect =
    selectedPlayerNames && selectedPlayerNames.length > 0
      ? Array.from(new Set([adminPlayerName, ...selectedPlayerNames]))
      : null;

  if (playerNamesToSelect) {
    for (const playerName of playerNamesToSelect) {
      await playersModal
        .getByRole("button", {
          name: new RegExp(`^${escapeRegex(playerName)}\\b`),
        })
        .click();
    }
  } else {
    await playersModal.getByRole("button", { name: "Select All" }).click();
    await expect(playersModal.getByRole("button", { name: "Deselect All" })).toBeVisible();
  }

  await playersModal.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Create Tournament" }).click();
  await expect(page).toHaveURL(/\/session\/.+/);
  await expect(page.getByRole("button", { name: "Start Session" })).toBeVisible();
  await page.getByRole("button", { name: "Start Session" }).click();

  const sessionCode = page.url().split("/").pop();
  if (!sessionCode) {
    throw new Error("Failed to capture created session code");
  }

  return sessionCode;
}

export async function openSessionSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  const settingsModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Session settings" }) });
  await expect(
    settingsModal.getByRole("heading", { name: "Session settings" })
  ).toBeVisible();
  return settingsModal;
}

export async function openSessionRoster(page: Page) {
  const settingsModal = await openSessionSettings(page);
  await settingsModal.getByRole("button", { name: "Add Players" }).click();

  const rosterModal = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Add Players" }) });
  await expect(rosterModal.getByRole("heading", { name: "Add Players" })).toBeVisible();
  return rosterModal;
}

export async function openSessionPlayersModal(page: Page) {
  await page.getByRole("button", { name: "Players" }).click();
  const playersModal = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Players" }) });
  await expect(playersModal.getByRole("heading", { name: "Players" })).toBeVisible();
  return playersModal;
}

export async function readSessionSnapshot(
  page: Page,
  code: string
): Promise<SessionSnapshot> {
  return page.evaluate(async (sessionCode) => {
    const res = await fetch(`/api/sessions/${sessionCode}`);
    if (!res.ok) {
      throw new Error(`Failed to load session ${sessionCode}: ${res.status}`);
    }
    return res.json();
  }, code);
}

export async function readCommunityMembersSnapshot(
  page: Page,
  communityId: string
): Promise<CommunityMembersSnapshot> {
  return page.evaluate(async (targetCommunityId) => {
    const res = await fetch(`/api/communities/${targetCommunityId}/members`);
    if (!res.ok) {
      throw new Error(`Failed to load community members ${targetCommunityId}: ${res.status}`);
    }
    return res.json();
  }, communityId);
}

export async function readCommunitySessionsSnapshot(
  page: Page,
  communityId: string
): Promise<CommunitySessionsSnapshot> {
  return page.evaluate(async (targetCommunityId) => {
    const res = await fetch(`/api/sessions?communityId=${encodeURIComponent(targetCommunityId)}`);
    if (!res.ok) {
      throw new Error(`Failed to load community sessions ${targetCommunityId}: ${res.status}`);
    }
    return res.json();
  }, communityId);
}

export async function readCommunityClaimRequestsSnapshot(
  page: Page,
  communityId: string
): Promise<CommunityClaimRequestsSnapshot> {
  return page.evaluate(async (targetCommunityId) => {
    const res = await fetch(`/api/communities/${targetCommunityId}/claim-requests`);
    if (!res.ok) {
      throw new Error(`Failed to load claim requests ${targetCommunityId}: ${res.status}`);
    }
    return res.json();
  }, communityId);
}

export async function createClaimRequest(
  page: Page,
  {
    communityId,
    targetUserId,
  }: {
    communityId: string;
    targetUserId: string;
  }
) {
  return page.evaluate(
    async ({ targetCommunityId, targetUserId: requestedTargetUserId }) => {
      const res = await fetch(`/api/communities/${targetCommunityId}/claim-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: requestedTargetUserId,
        }),
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        body: text ? JSON.parse(text) : {},
      };
    },
    { targetCommunityId: communityId, targetUserId }
  );
}

export async function readCurrentMatchSignature(page: Page, code: string) {
  const snapshot = await readSessionSnapshot(page, code);
  const currentMatch = snapshot.courts.find((court) => court.currentMatch)?.currentMatch;

  if (!currentMatch) {
    return "";
  }

  return [
    currentMatch.team1User1.name,
    currentMatch.team1User2.name,
    "vs",
    currentMatch.team2User1.name,
    currentMatch.team2User2.name,
  ].join("|");
}

export async function readCurrentMatchMixicanoShape(page: Page, code: string) {
  const snapshot = await readSessionSnapshot(page, code);
  const currentMatch = snapshot.courts.find((court) => court.currentMatch)?.currentMatch;

  if (!currentMatch) {
    return null;
  }

  const genderByUserId = new Map(
    snapshot.players.map((player) => [player.userId, player.gender])
  );
  const team1Ids = [currentMatch.team1User1.id, currentMatch.team1User2.id] as const;
  const team2Ids = [currentMatch.team2User1.id, currentMatch.team2User2.id] as const;
  const countFemales = (ids: readonly string[]) =>
    ids.filter((id) => genderByUserId.get(id) === PlayerGender.FEMALE).length;

  return {
    signature: [
      currentMatch.team1User1.name,
      currentMatch.team1User2.name,
      "vs",
      currentMatch.team2User1.name,
      currentMatch.team2User2.name,
    ].join("|"),
    team1FemaleCount: countFemales(team1Ids),
    team2FemaleCount: countFemales(team2Ids),
  };
}

export async function submitAndApproveVisibleMatch(
  page: Page,
  {
    team1Score,
    team2Score,
  }: {
    team1Score: number;
    team2Score: number;
  }
) {
  const scoreInputs = page.locator('input[type="number"]');
  await expect(scoreInputs).toHaveCount(2);
  await scoreInputs.nth(0).fill(String(team1Score));
  await scoreInputs.nth(1).fill(String(team2Score));
  await page.getByRole("button", { name: "Submit Score" }).click();
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Awaiting Confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm Results" }).click();
}

export async function createManualMatchWithPlayers(
  page: Page,
  playerLabels: [string, string, string, string]
) {
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
  await page.getByRole("button", { name: "Manual" }).click();

  const manualModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Manual Match" }) });
  await expect(manualModal.getByRole("heading", { name: "Manual Match" })).toBeVisible();

  const selects = manualModal.locator("select");
  for (const [index, label] of playerLabels.entries()) {
    await selects.nth(index).selectOption({ label });
  }

  await manualModal.getByRole("button", { name: "Create Match" }).click();
  await expect(manualModal).toHaveCount(0);
}

function getSessionTypeButtonName(sessionType: SessionType) {
  switch (sessionType) {
    case SessionType.ELO:
      return "Ratings";
    case SessionType.LADDER:
      return "Ladder";
    case SessionType.RACE:
      return "Race";
    default:
      return "Points";
  }
}

function getSessionModeButtonName(sessionMode: SessionMode) {
  return sessionMode === SessionMode.MIXICANO ? "Mixed" : "Open";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
