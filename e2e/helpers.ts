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
export const hostClubId = "community-host-e2e";
export const adminControlsClubId = "community-admin-controls-e2e";
export const claimClubId = "community-claim-e2e";
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

interface ClubMemberSnapshot {
  id: string;
  name: string;
  elo: number;
}

interface ClubSessionSnapshot {
  code: string;
  name: string;
  status: string;
}

interface ClubClaimRequestSnapshot {
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

export type ClubMembersSnapshot = ClubMemberSnapshot[];
export type ClubSessionsSnapshot = ClubSessionSnapshot[];
export type ClubClaimRequestsSnapshot = ClubClaimRequestSnapshot[];

export function getHostPlayerCredentials(index: number) {
  return {
    email: `host-player-${index}@example.com`,
    password: "Password123!",
  };
}

export async function signIn(page: Page, credentials: { email: string; password: string }) {
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
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
  await page.goto(`/club/${hostClubId}`);
  await expect(
    page.getByRole("heading", { name: "E2E Host Club" })
  ).toBeVisible();

  const hostSetupButton = page.getByRole("button", {
    name: "Host Setup desk",
  });
  const hostSetupBottomTab = page
    .getByRole("button", { name: "Host setup", exact: true })
    .filter({ visible: true })
    .first();

  if (await hostSetupButton.isVisible()) {
    await hostSetupButton.click();
  } else if (await hostSetupBottomTab.isVisible().catch(() => false)) {
    await hostSetupBottomTab.click();
  } else {
    await page.getByRole("button", { name: "Open Host Setup" }).click();
  }
  const hostPanel = page
    .locator("section.app-panel")
    .filter({ has: page.getByText("New tournament") })
    .filter({ visible: true });
  await expect(hostPanel).toBeVisible();

  await hostPanel.getByLabel("Name", { exact: true }).fill(sessionName);
  const formatLabel = getSessionTypeButtonName(sessionType);
  let selectedFormat = false;
  const selects = hostPanel.locator("select");
  for (let index = 0; index < (await selects.count()); index += 1) {
    const select = selects.nth(index);
    const optionLabels = await select.locator("option").allTextContents();
    if (optionLabels.includes(formatLabel)) {
      await select.selectOption({ label: formatLabel });
      selectedFormat = true;
      break;
    }
  }
  if (!selectedFormat) {
    const formatButton = hostPanel.getByRole("button", {
      name: formatLabel,
      exact: true,
    });
    if ((await formatButton.count()) > 0) {
      await formatButton.click();
      selectedFormat = true;
    }
  }
  if (!selectedFormat && sessionType !== SessionType.POINTS) {
    throw new Error(`Unable to select session type ${formatLabel}`);
  }
  await hostPanel
    .getByRole("button", {
      name: getSessionModeButtonName(sessionMode),
      exact: true,
    })
    .click();
  await hostPanel
    .getByRole("combobox", { name: "Courts" })
    .selectOption(String(courtCount));

  await hostPanel.getByRole("button", { name: "Choose" }).click();
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
      const playerButton = playersModal
        .getByRole("button")
        .filter({ hasText: playerName });
      await expect(playerButton).toBeVisible();
      await playerButton.click();
    }
  } else {
    await playersModal.getByRole("button", { name: "Select All" }).click();
    await expect(playersModal.getByRole("button", { name: "Deselect All" })).toBeVisible();
  }

  await playersModal.getByRole("button", { name: "Done" }).click();

  await hostPanel.getByRole("button", { name: "Create Tournament" }).click();
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

export async function readClubMembersSnapshot(
  page: Page,
  clubId: string
): Promise<ClubMembersSnapshot> {
  return page.evaluate(async (targetClubId) => {
    const res = await fetch(`/api/clubs/${targetClubId}/members`);
    if (!res.ok) {
      throw new Error(`Failed to load club members ${targetClubId}: ${res.status}`);
    }
    return res.json();
  }, clubId);
}

export async function readClubSessionsSnapshot(
  page: Page,
  clubId: string
): Promise<ClubSessionsSnapshot> {
  return page.evaluate(async (targetClubId) => {
    const res = await fetch(`/api/sessions?clubId=${encodeURIComponent(targetClubId)}`);
    if (!res.ok) {
      throw new Error(`Failed to load club sessions ${targetClubId}: ${res.status}`);
    }
    return res.json();
  }, clubId);
}

export async function readClubClaimRequestsSnapshot(
  page: Page,
  clubId: string
): Promise<ClubClaimRequestsSnapshot> {
  return page.evaluate(async (targetClubId) => {
    const res = await fetch(`/api/clubs/${targetClubId}/claim-requests`);
    if (!res.ok) {
      throw new Error(`Failed to load claim requests ${targetClubId}: ${res.status}`);
    }
    return res.json();
  }, clubId);
}

export async function createClaimRequest(
  page: Page,
  {
    clubId,
    targetUserId,
  }: {
    clubId: string;
    targetUserId: string;
  }
) {
  return page.evaluate(
    async ({ targetClubId, targetUserId: requestedTargetUserId }) => {
      const res = await fetch(`/api/clubs/${targetClubId}/claim-requests`, {
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
    { targetClubId: clubId, targetUserId }
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
  const confirmResultsButton = page.getByRole("button", {
    name: "Confirm Results",
  });
  if (await confirmResultsButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(page.getByText("Awaiting Confirmation")).toBeVisible();
    await confirmResultsButton.click();
  }
}

export async function createManualMatchWithPlayers(
  page: Page,
  playerLabels: [string, string, string, string]
) {
  const manualModal = await openManualMatchModal(page);

  const selects = manualModal.locator("select");
  if ((await selects.count()) > 0) {
    for (const [index, label] of playerLabels.entries()) {
      await selects.nth(index).selectOption({ label });
    }
  } else {
    for (const label of playerLabels) {
      const playerName = label.replace(/\s+\(\d+\)$/, "");
      const playerButton = manualModal
        .getByRole("button")
        .filter({ hasText: playerName });
      await expect(playerButton).toBeVisible();
      await playerButton.click();
    }
  }

  await manualModal.getByRole("button", { name: "Create Match" }).click();
  await expect(manualModal).toHaveCount(0);
}

export async function openManualMatchModal(page: Page) {
  const createButton = page
    .getByRole("button", { name: "Create", exact: true })
    .filter({ visible: true })
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();

  const manualOption = page
    .getByRole("button", { name: "Manual", exact: true })
    .filter({ visible: true });
  await expect(manualOption).toBeVisible();
  await manualOption.click();

  const manualModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Manual Match" }) });
  await expect(
    manualModal.getByRole("heading", { name: "Manual Match" })
  ).toBeVisible();

  return manualModal;
}

function getSessionTypeButtonName(sessionType: SessionType) {
  switch (sessionType) {
    case SessionType.SOCIAL_MIX:
      return "Social Mix";
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
