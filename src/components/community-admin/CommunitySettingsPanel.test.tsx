import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { CommunitySettingsPanel } from "./CommunitySettingsPanel";

function renderPanel(
  overrides: Partial<ComponentProps<typeof CommunitySettingsPanel>> = {}
) {
  return renderToStaticMarkup(
    <CommunitySettingsPanel
      communityName="Community One"
      onCommunityNameChange={vi.fn()}
      communityPassword=""
      onCommunityPasswordChange={vi.fn()}
      passwordProtectionEnabled={false}
      onPasswordProtectionEnabledChange={vi.fn()}
      isPasswordProtected={false}
      onSubmit={vi.fn()}
      saving={false}
      {...overrides}
    />
  );
}

describe("CommunitySettingsPanel", () => {
  it("shows public-community copy when password protection is disabled", () => {
    const markup = renderPanel();

    expect(markup).toContain("Anyone can join without a password.");
    expect(markup).not.toContain('placeholder="Set a password (min 4 characters)"');
  });

  it("shows removal copy when turning password protection off for a protected community", () => {
    const markup = renderPanel({
      isPasswordProtected: true,
      passwordProtectionEnabled: false,
    });

    expect(markup).toContain(
      "Saving will remove the password and make the community public."
    );
  });

  it("shows the password field when password protection is enabled", () => {
    const markup = renderPanel({
      passwordProtectionEnabled: true,
      isPasswordProtected: false,
    });

    expect(markup).toContain('placeholder="Set a password (min 4 characters)"');
  });
});
