import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { ClubSettingsPanel } from "./ClubSettingsPanel";

function renderPanel(
  overrides: Partial<ComponentProps<typeof ClubSettingsPanel>> = {}
) {
  return renderToStaticMarkup(
    <ClubSettingsPanel
      clubName="Club One"
      onClubNameChange={vi.fn()}
      clubPassword=""
      onClubPasswordChange={vi.fn()}
      passwordProtectionEnabled={false}
      onPasswordProtectionEnabledChange={vi.fn()}
      isPasswordProtected={false}
      onSubmit={vi.fn()}
      saving={false}
      {...overrides}
    />
  );
}

describe("ClubSettingsPanel", () => {
  it("shows public-club copy when password protection is disabled", () => {
    const markup = renderPanel();

    expect(markup).toContain("Anyone can join without a password.");
    expect(markup).not.toContain('placeholder="Set a password (min 4 characters)"');
  });

  it("shows removal copy when turning password protection off for a protected club", () => {
    const markup = renderPanel({
      isPasswordProtected: true,
      passwordProtectionEnabled: false,
    });

    expect(markup).toContain(
      "Saving will remove the password and make the club public."
    );
  });

  it("shows the password field when password protection is enabled", () => {
    const markup = renderPanel({
      passwordProtectionEnabled: true,
      isPasswordProtected: false,
    });

    expect(markup).toContain('placeholder="Set a password (min 4 characters)"');
  });

  it("shows read-only tutorial identity instead of rename controls", () => {
    const markup = renderPanel({
      clubName: "Tutorial playground",
      isTutorial: true,
    });

    expect(markup).toContain("Tutorial Settings");
    expect(markup).toContain("Tutorial playground");
    expect(markup).not.toContain("Club name");
    expect(markup).not.toContain("Save Settings");
  });
});
