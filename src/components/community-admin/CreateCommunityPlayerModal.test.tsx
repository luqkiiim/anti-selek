import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  CommunityPlayerStatus,
  PlayerGender,
} from "@/types/enums";
import { CreateCommunityPlayerModal } from "./CreateCommunityPlayerModal";

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

describe("CreateCommunityPlayerModal", () => {
  it("keeps local placeholder creation and removes cross-community linking copy", () => {
    const markup = renderToStaticMarkup(
      <CreateCommunityPlayerModal
        open
        name="Alex Lee"
        newPlayerGender={PlayerGender.MALE}
        newPlayerMixedSideOverride={null}
        newPlayerStatus={CommunityPlayerStatus.CORE}
        onNameChange={vi.fn()}
        onNewPlayerGenderChange={vi.fn()}
        onNewPlayerMixedSideOverrideChange={vi.fn()}
        onNewPlayerStatusChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("Local placeholder only");
    expect(markup).toContain(
      "Players who already belong in this community should join it themselves and request a claim on their placeholder profile."
    );
    expect(markup).not.toContain("Link existing unclaimed player");
    expect(markup).not.toContain("Search existing placeholders");
  });
});
