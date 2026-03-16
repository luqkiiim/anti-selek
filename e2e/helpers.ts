import { expect, type Page } from "@playwright/test";
import { PlayerGender, SessionMode, SessionType } from "../src/types/enums";

export const adminCredentials = {
  email: "admin-e2e@example.com",
  password: "Password123!",
};

export const adminUserId = "user-admin-e2e";
export const hostCommunityId = "community-host-e2e";
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

export async function signInAsAdmin(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(adminCredentials.email);
  await page.getByLabel("Password").fill(adminCredentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
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

  await page.getByRole("button", { name: "Host Tournament" }).click();
  await page.getByPlaceholder("Tournament Name").fill(sessionName);
  await page
    .getByRole("button", {
      name: sessionType === SessionType.ELO ? "Ratings Format" : "Points Format",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: sessionMode === SessionMode.MIXICANO ? "Mixed" : "Open",
      exact: true,
    })
    .click();
  await page.locator("select").selectOption(String(courtCount));

  await page.getByRole("button", { name: "Add Players" }).click();
  const playersModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Add Players" }) });
  await expect(playersModal.getByRole("heading", { name: "Add Players" })).toBeVisible();

  if (selectedPlayerNames && selectedPlayerNames.length > 0) {
    for (const playerName of selectedPlayerNames) {
      await playersModal
        .getByRole("button", { name: new RegExp(`^${escapeRegex(playerName)}\\s`) })
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

  await expect(
    page.getByRole("heading", { name: "Confirm score submission" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Submission" }).click();
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
