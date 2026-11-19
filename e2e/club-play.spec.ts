import { expect, test } from "@playwright/test";
import { expectCurrentUi } from "./current-ui";
import { signInAsAdmin } from "./helpers";

test("prepares Club Play and records a mixed match", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  await page.goto("/club/community-host-e2e");
  await expectCurrentUi(page, "club");
  await page.goto("/club/community-host-e2e?tab=setup");
  await expectCurrentUi(page);
  await expect(page).toHaveURL(/\/club\/community-host-e2e\?tab=setup/);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();

  const setup = page.getByRole("region", { name: "Session setup" });
  await setup.getByRole("textbox", { name: "Session name" }).fill("E2E Club Play");
  await setup.getByRole("button", { name: "Add players" }).click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?" });
  for (const number of [1, 2, 3, 4]) {
    await roster.getByRole("checkbox", { name: new RegExp(`Host Player ${number}`) }).check();
  }
  await roster.getByRole("button", { name: "Done · 4 players" }).click();
  await setup.getByRole("radio", { name: /^Club Play/ }).check();
  await expect(setup.getByRole("checkbox", { name: "Mixed pairs" })).toBeChecked();
  await setup.getByText("More options", { exact: true }).click();
  await expect(setup.getByRole("checkbox", { name: /^Player groups/ })).toHaveCount(0);
  await expect(setup.getByRole("radio", { name: "Session points" })).toHaveCount(0);

  const createResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/sessions" && response.request().method() === "POST"
  );
  await setup.getByRole("button", { name: "Prepare session" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { code } = await created.json();
  const endpoint = `/api/sessions/${code}`;
  await expect(page).toHaveURL(new RegExp(`/session/${code}`));
  await expectCurrentUi(page);
  await expect(page.getByText("Club Play", { exact: true })).toBeVisible();
  const initial = await page.request.get(endpoint);
  expect(await initial.json()).toMatchObject({
    type: "CLUB_PLAY",
    matchmakingStyle: "CLUB_PLAY",
    balanceMetric: "RATING",
    pairingMode: "MIXED",
    poolsEnabled: false,
  });

  await page.getByRole("button", { name: "Review session settings" }).click();
  const settings = page.getByRole("dialog", { name: "Session settings" });
  await expect(settings.getByRole("combobox", { name: "Matchmaking style" })).toHaveValue("CLUB_PLAY");
  await settings.getByRole("combobox", { name: "Pairing" }).selectOption("OPEN");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(settings).toHaveCount(0);
  const saved = await page.request.get(endpoint);
  expect(await saved.json()).toMatchObject({
    type: "CLUB_PLAY",
    matchmakingStyle: "CLUB_PLAY",
    balanceMetric: "RATING",
    pairingMode: "OPEN",
    poolsEnabled: false,
  });

  await page.getByRole("button", { name: "Review session settings" }).click();
  await settings.getByRole("combobox", { name: "Pairing" }).selectOption("MIXED");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(settings).toHaveCount(0);
  const startResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === `${endpoint}/start` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const started = await startResponse;
  expect(started.ok(), `Start returned ${started.status()}: ${(await started.text()).slice(0, 200)}`).toBe(true);
  await expectCurrentUi(page, "session");

  const generationResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === `${endpoint}/generate-match` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Create matches", exact: true }).click();
  const generated = await generationResponse;
  expect(generated.ok(), `Generate returned ${generated.status()}: ${(await generated.text()).slice(0, 200)}`).toBe(true);
  const match = await generated.json();
  expect(match).toMatchObject({
    courtGroupType: null,
    matchmakingReason: {
      source: "club-play",
      sessionType: "CLUB_PLAY",
      clubPlayMatchType: { category: "MIXED" },
    },
  });

  await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
  await page.getByRole("textbox", { name: "Team 2 score" }).fill("19");
  await page.getByRole("button", { name: "Save score", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toHaveCount(0);

  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Match history", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/session/${code}/history`));
  await expectCurrentUi(page);
  const history = page.getByRole("region", { name: "Session match history" });
  await expect(history.getByRole("heading", { name: "E2E Club Play" })).toBeVisible();
  await expect(history.getByText("Club Play · 1 completed match", { exact: true })).toBeVisible();
  await expect(history.getByLabel("21 to 19")).toBeVisible();
});
