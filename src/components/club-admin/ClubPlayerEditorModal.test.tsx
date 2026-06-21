import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";
import type { ClubAdminPlayer } from "./clubAdminTypes";
import { ClubPlayerEditorModal } from "./ClubPlayerEditorModal";

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
  overrides: Partial<ClubAdminPlayer> = {}
): ClubAdminPlayer {
  return {
    id: "player-1",
    name: "Player One",
    email: null,
    avatarUrl: null,
    status: ClubPlayerStatus.CORE,
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

function renderModal(
  player: ClubAdminPlayer,
  {
    canDemoteAdmins = false,
    currentUserId = null,
  }: { canDemoteAdmins?: boolean; currentUserId?: string | null } = {}
) {
  return renderToStaticMarkup(
    <ClubPlayerEditorModal
      player={player}
      communityId="community-1"
      currentUserId={currentUserId}
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
      onDemoteAdmin={vi.fn()}
      onGrantStaff={vi.fn(async () => {})}
      onRevokeStaff={vi.fn(async () => {})}
      onOpenPasswordReset={vi.fn()}
      canDemoteAdmins={canDemoteAdmins}
      canOpenEmergencyPasswordReset={false}
      onUploadAvatar={vi.fn(async () => {})}
      onRemoveAvatar={vi.fn(async () => {})}
    />
  );
}

describe("ClubPlayerEditorModal", () => {
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
      "Club admins can rename unclaimed placeholder profiles."
    );
    expect(markup).not.toContain('type="text" disabled=""');
  });

  it("does not show the merge duplicate action for placeholders", () => {
    const markup = renderModal(buildPlayer());

    expect(markup).not.toContain("Merge duplicate");
  });

  it("shows staff controls for claimed non-admin members", () => {
    const memberMarkup = renderModal(
      buildPlayer({ isClaimed: true, email: "member@example.com" })
    );
    const staffMarkup = renderModal(
      buildPlayer({
        isClaimed: true,
        email: "staff@example.com",
        role: "STAFF",
      })
    );

    expect(memberMarkup).toContain("Make staff");
    expect(memberMarkup).toContain("Promote to admin");
    expect(staffMarkup).toContain("Change to member");
    expect(staffMarkup).toContain("Staff");
  });

  it("shows owner protection and the Owner pill", () => {
    const markup = renderModal(
      buildPlayer({
        isClaimed: true,
        email: "owner@example.com",
        role: "ADMIN",
        isOwner: true,
      }),
      { canDemoteAdmins: true }
    );

    expect(markup).toContain("Owner");
    expect(markup).toContain("The club owner keeps permanent admin access.");
    expect(markup).toContain("The owner cannot be removed.");
    expect(markup).not.toContain("Change to staff");
    expect(markup).not.toContain("Change to member");
    expect(markup).not.toContain("Remove player");
  });

  it("shows admin demotion controls only when allowed", () => {
    const admin = buildPlayer({
      isClaimed: true,
      email: "admin@example.com",
      role: "ADMIN",
    });
    const ownerMarkup = renderModal(admin, { canDemoteAdmins: true });
    const regularAdminMarkup = renderModal(admin);

    expect(ownerMarkup).toContain("Change to staff");
    expect(ownerMarkup).toContain("Change to member");
    expect(ownerMarkup).toContain("Demote admins before removing them.");
    expect(regularAdminMarkup).not.toContain("Change to staff");
    expect(regularAdminMarkup).not.toContain("Change to member");
    expect(regularAdminMarkup).toContain(
      "Only the club owner can change another admin role."
    );
  });

  it("shows leave club for the current admin", () => {
    const markup = renderModal(
      buildPlayer({
        id: "admin-1",
        isClaimed: true,
        email: "admin@example.com",
        role: "ADMIN",
      }),
      { currentUserId: "admin-1" }
    );

    expect(markup).toContain("Leave club");
    expect(markup).not.toContain("Demote admins before removing them.");
  });
});
