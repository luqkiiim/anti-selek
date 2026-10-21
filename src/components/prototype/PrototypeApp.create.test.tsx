// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PrototypeApp from "./PrototypeApp";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({
  data: { user: { id: "creator", name: "Ari", canBrowseAllClubs: true } },
  status: "authenticated",
}) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./Primitives", () => ({
  Avatar: () => <span />,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, onClose, children }: { open?: boolean; title: string; onClose: () => void; children: ReactNode }) => open ? (
    <div role="dialog" aria-label={title}><button onClick={onClose}>Close</button>{children}</div>
  ) : null,
}));

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", "/?chooser=1");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    json: async () => String(url) === "/api/user/me"
      ? { user: { id: "creator", name: "Ari", gender: "FEMALE", isQuickAccess: false } }
      : init?.method === "POST" ? { id: "created-club" } : [],
  }) as Response));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

function createButton() {
  return container.querySelector<HTMLButtonElement>('[aria-label="Create club"] .primary')!;
}
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function openCreate() {
  await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Create club")!.click());
}

it.each(["", " club-secret "])("creates a club with an optional password %j", async (password) => {
  await act(async () => root.render(<PrototypeApp />));
  await openCreate();
  const dialog = container.querySelector('[aria-label="Create club"]')!;
  const passwordInput = dialog.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(passwordInput.labels?.[0].textContent).toContain("Password (optional)");
  expect(passwordInput.required).toBe(false);
  await input(dialog.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!, "Riverside");
  await input(passwordInput, password);
  expect(createButton().disabled).toBe(false);
  await act(async () => createButton().click());

  const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(post[0]).toBe("/api/clubs");
  expect(JSON.parse(post[1]!.body as string)).toEqual({ name: "Riverside", allowJoinRequests: true, ...(password ? { password } : {}) });
  expect(router.push).toHaveBeenCalledWith("/club/created-club?tab=club", { scroll: false });
});

it("prevents creation with a short password and clears it when reopening the sheet", async () => {
  await act(async () => root.render(<PrototypeApp />));
  await openCreate();
  const dialog = container.querySelector('[aria-label="Create club"]')!;
  await input(dialog.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!, "Riverside");
  await input(dialog.querySelector<HTMLInputElement>('input[type="password"]')!, "123");
  expect(createButton().disabled).toBe(true);
  await act(async () => createButton().click());
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await act(async () => dialog.querySelector<HTMLButtonElement>("button")!.click());
  await openCreate();
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
});
