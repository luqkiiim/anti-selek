// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubPageClub } from "@/components/club/clubTypes";
import { ClubSettings } from "./ClubSettings";

vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, children }: { open?: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
}));
vi.mock("react-easy-crop", () => ({ default: () => null }));

const baseClub: ClubPageClub = { id: "club-1", name: "Riverside", role: "ADMIN", isPasswordProtected: false, isTutorial: false, membersCount: 3, sessionsCount: 2 };

describe("ClubSettings join code", () => {
  let container: HTMLDivElement;
  let root: Root;
  let refresh: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    refresh = vi.fn(async () => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "club-1" }) }) as Response));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function render(overrides: Partial<ClubPageClub> = {}) {
    await act(async () => root.render(<ClubSettings club={{ ...baseClub, ...overrides }} allowJoinRequests busy={false} onInvite={() => {}} onToggleJoins={() => {}} refresh={refresh} onDeleted={async () => {}} />));
  }
  function button(label: string) {
    const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label));
    if (!found) throw new Error(`Missing button ${label}`);
    return found;
  }
  function codeInput() { return container.querySelector<HTMLInputElement>('.club-join-code-form input')!; }
  async function type(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(codeInput(), value);
      codeInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it("sets a join code of at least four characters and clears the secret after submission", async () => {
    await render();
    expect(codeInput().type).toBe("password");
    await type("123"); expect(button("Set join code").disabled).toBe(true);
    await type("1234");
    await act(async () => button("Set join code").click());
    expect(fetch).toHaveBeenCalledWith("/api/clubs/club-1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ password: "1234", isPasswordProtected: true }) }));
    expect(codeInput().value).toBe(""); expect(refresh).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Club join code updated.");
  });
  it("replaces an existing code without revealing it", async () => {
    await render({ isPasswordProtected: true });
    expect(codeInput().value).toBe(""); expect(container.textContent).toContain("The saved code cannot be displayed");
    await type("replacement");
    await act(async () => button("Replace join code").click());
    expect(fetch).toHaveBeenCalledWith("/api/clubs/club-1", expect.objectContaining({ body: JSON.stringify({ password: "replacement", isPasswordProtected: true }) }));
    expect(codeInput().value).toBe("");
  });
  it("removes protection using the existing PATCH contract", async () => {
    await render({ isPasswordProtected: true }); await type("unused-secret");
    await act(async () => button("Remove join code").click());
    expect(fetch).toHaveBeenCalledWith("/api/clubs/club-1", expect.objectContaining({ body: JSON.stringify({ password: "", isPasswordProtected: false }) }));
    expect(codeInput().value).toBe(""); expect(container.textContent).toContain("Club join code removed.");
  });
  it("clears rejected codes and reports the API error", async () => {
    await render(); await type("rejected-code");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Only admins can edit club settings" }) } as Response);
    await act(async () => button("Set join code").click());
    expect(codeInput().value).toBe(""); expect(container.textContent).toContain("Only admins can edit club settings");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("keeps join code management restricted to admins and excludes tutorial clubs", async () => {
    await render({ role: "STAFF" }); expect(container.querySelector('.club-join-code-form')).toBeNull();
    await render({ role: "MEMBER" }); expect(container.querySelector('.club-join-code-form')).toBeNull();
    await render({ isTutorial: true }); expect(container.querySelector('.club-join-code-form')).toBeNull();
  });
});
