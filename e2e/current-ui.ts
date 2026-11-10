import { expect, type Page } from "@playwright/test";

/** Verify the canonical product shell and real route before current-UI checks. */
export async function expectCurrentUi(page: Page, screen?: "club" | "session") {
  const shell = page.locator(".product-root");
  await expect(shell).toBeVisible();
  if (screen) {
    await expect(page).toHaveURL(screen === "club" ? /\/club\// : /\/session\//);
    await expect(shell.getByRole("navigation", {
      name: screen === "club" ? "Main navigation" : "Session navigation", exact: true,
    })).toBeVisible();
  }
}
