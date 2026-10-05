// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({
  sessionStatus: "loading" as "loading" | "authenticated" | "unauthenticated",
  signIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  getSession: vi.fn(),
  signIn: mocks.signIn,
  useSession: () => ({ data: null, status: mocks.sessionStatus }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("sign-in session bootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.sessionStatus = "loading";
    mocks.signIn.mockReset().mockResolvedValue({ error: "CredentialsSignin" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("holds credential submission until the session bootstrap settles", async () => {
    await act(async () => root.render(<Page />));

    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    const form = container.querySelector<HTMLFormElement>("form");
    expect(submit?.disabled).toBe(true);
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.signIn).not.toHaveBeenCalled();

    mocks.sessionStatus = "unauthenticated";
    await act(async () => root.render(<Page />));
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});
