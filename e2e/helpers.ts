import { expect, type Page } from "@playwright/test";

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
}

interface SessionMatchSnapshot {
  status: string;
}

interface SessionCourtSnapshot {
  currentMatch: null | {
    team1User1: { name: string };
    team1User2: { name: string };
    team2User1: { name: string };
    team2User2: { name: string };
  };
}

export interface SessionSnapshot {
  players: SessionPlayerSnapshot[];
  matches?: SessionMatchSnapshot[];
  courts: SessionCourtSnapshot[];
}

export async function signInAsAdmin(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(adminCredentials.email);
  await page.getByLabel("Password").fill(adminCredentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
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
