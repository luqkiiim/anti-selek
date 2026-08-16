// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/chrome", () => ({
  FlashMessage: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  ModalFrame: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div role="dialog">
      {children}
      {footer}
    </div>
  ),
}));

import { CreateClubModal } from "./CreateClubModal";
import { JoinClubModal } from "./JoinClubModal";

describe("dashboard club dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("submits a valid create form with Enter-compatible form semantics", async () => {
    const onCreateClub = vi.fn();
    await act(async () => {
      root.render(
        <CreateClubModal
          open
          clubName="Net Players"
          clubPassword="1234"
          creatingClub={false}
          error={null}
          onClubNameChange={vi.fn()}
          onClubPasswordChange={vi.fn()}
          onClose={vi.fn()}
          onCreateClub={onCreateClub}
        />
      );
    });

    const form = container.querySelector("form");
    expect(form?.id).toBe("create-club-form");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.form?.id).toBe(
      "create-club-form"
    );

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onCreateClub).toHaveBeenCalledOnce();
  });

  it("focuses the affected join field and connects it to the inline error", async () => {
    await act(async () => {
      root.render(
        <JoinClubModal
          open
          clubName="Net Players"
          clubPassword="wrong"
          joiningClub={false}
          error={{ error: "Invalid password", field: "password" }}
          onClubNameChange={vi.fn()}
          onClubPasswordChange={vi.fn()}
          onClose={vi.fn()}
          onJoinClub={vi.fn()}
        />
      );
    });

    const password = container.querySelector<HTMLInputElement>(
      'input[type="password"]'
    );
    expect(document.activeElement).toBe(password);
    expect(password?.getAttribute("aria-invalid")).toBe("true");
    expect(password?.getAttribute("aria-describedby")).toContain(
      "join-club-error"
    );
    expect(container.textContent).toContain("Invalid password");
  });

  it("focuses the alert for a generic create failure", async () => {
    await act(async () => {
      root.render(
        <CreateClubModal
          open
          clubName="Net Players"
          clubPassword=""
          creatingClub={false}
          error={{ error: "Failed to create club" }}
          onClubNameChange={vi.fn()}
          onClubPasswordChange={vi.fn()}
          onClose={vi.fn()}
          onCreateClub={vi.fn()}
        />
      );
    });

    expect((document.activeElement as HTMLElement | null)?.textContent).toContain(
      "Failed to create club"
    );
  });
});
