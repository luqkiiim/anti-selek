import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  ClubPlayerStatus,
  PlayerGender,
} from "@/types/enums";
import { CreateClubPlayerModal } from "./CreateClubPlayerModal";

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

describe("CreateClubPlayerModal", () => {
  it("keeps local placeholder creation and removes cross-club linking copy", () => {
    const markup = renderToStaticMarkup(
      <CreateClubPlayerModal
        open
        name="Alex Lee"
        newPlayerGender={PlayerGender.MALE}
        newPlayerMixedSideOverride={null}
        newPlayerStatus={ClubPlayerStatus.CORE}
        newPlayerNeedsMoreRest={false}
        onNameChange={vi.fn()}
        onNewPlayerGenderChange={vi.fn()}
        onNewPlayerMixedSideOverrideChange={vi.fn()}
        onNewPlayerStatusChange={vi.fn()}
        onNewPlayerNeedsMoreRestChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("Local placeholder only");
    expect(markup).toContain("More rest");
    expect(markup).toContain(
      "Players who already belong in this club should join it themselves and request a claim on their placeholder profile."
    );
    expect(markup).not.toContain("Link existing unclaimed player");
    expect(markup).not.toContain("Search existing placeholders");
  });
});
