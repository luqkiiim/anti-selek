import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";
import type { CommunityAdminPlayer } from "./communityAdminTypes";
import { CommunityPlayerEditorModal } from "./CommunityPlayerEditorModal";

vi.mock("@/components/ui/chrome", () => ({
  ModalFrame: ({
    title,
    subtitle,
    children,
    footer,
  }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
}));

function buildPlayer(
  overrides: Partial<CommunityAdminPlayer> = {}
): CommunityAdminPlayer {
  return {
    id: "player-1",
    name: "Player One",
    email: null,
    avatarUrl: null,
    status: CommunityPlayerStatus.CORE,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    elo: 1000,
    isActive: true,
    isClaimed: false,
    role: "MEMBER",
    createdAt: "2026-05-19T00:00:00.000Z",
    ...overrides,
  };
}

function renderModal(player: CommunityAdminPlayer) {
  return renderToStaticMarkup(
    <CommunityPlayerEditorModal
      player={player}
      communityId="community-1"
      editorName={player.name}
      editorRating={String(player.elo)}
      savingName={false}
      savingRating={false}
      savingRole={false}
      savingPreferences={false}
      removingPlayer={false}
      onEditorNameChange={vi.fn()}
      onEditorRatingChange={vi.fn()}
      onClose={vi.fn()}
      onRemovePlayer={vi.fn()}
      onSavePlayerName={vi.fn(async () => {})}
      onSavePlayerRating={vi.fn(async () => {})}
      onUpdatePreferences={vi.fn(async () => {})}
      onPromotePlayer={vi.fn()}
      onOpenPasswordReset={vi.fn()}
      canOpenEmergencyPasswordReset={false}
      onOpenMergeDuplicate={vi.fn()}
      onUploadAvatar={vi.fn(async () => {})}
      onRemoveAvatar={vi.fn(async () => {})}
    />
  );
}

describe("CommunityPlayerEditorModal", () => {
  it("disables name editing for claimed members", () => {
    const markup = renderModal(
      buildPlayer({
        isClaimed: true,
        email: "claimed@example.com",
      })
    );

    expect(markup).toContain("Claimed members manage their own account name.");
    expect(markup).toContain(
      '<input type="text" class="field" disabled="" value="Player One"/>'
    );
    expect(markup).toContain(
      "Claimed members recover passwords from the sign-in screen by email."
    );
  });

  it("keeps name editing available for unclaimed placeholders", () => {
    const markup = renderModal(buildPlayer());

    expect(markup).toContain(
      "Community admins can rename unclaimed placeholder profiles."
    );
    expect(markup).not.toContain('type="text" disabled=""');
  });
});
