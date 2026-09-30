import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  SessionMatchmakingStyle,
  SessionPairingMode,
} from "@/types/enums";
import { PairingModeControl } from "./GameplaySettingsControls";

function renderPairingControl(
  value: SessionPairingMode,
  matchmakingStyle: SessionMatchmakingStyle
) {
  return renderToStaticMarkup(
    <PairingModeControl
      value={value}
      onChange={vi.fn()}
      openLabel="Open"
      mixedLabel="Mixed"
      matchmakingStyle={matchmakingStyle}
    />
  );
}

describe("PairingModeControl help text", () => {
  it("explains Balanced Mixed variety without changing Open or Social wording", () => {
    const balancedMixed = renderPairingControl(
      SessionPairingMode.MIXED,
      SessionMatchmakingStyle.BALANCED
    );
    const balancedOpen = renderPairingControl(
      SessionPairingMode.OPEN,
      SessionMatchmakingStyle.BALANCED
    );
    const socialMixed = renderPairingControl(
      SessionPairingMode.MIXED,
      SessionMatchmakingStyle.SOCIAL
    );

    expect(balancedMixed).toContain("Open");
    expect(balancedMixed).toContain("Mixed");
    expect(balancedMixed).toContain(
      "Aims for a fair mix of mixed and same-gender games, adjusting to the available players and pairing settings."
    );
    expect(balancedOpen).toContain(
      "Any combination of players can form a team, regardless of gender."
    );
    expect(socialMixed).toContain(
      "Each doubles team uses one player from each mixed-pairing side"
    );
  });
});
