// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  signIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  getSession: mocks.getSession,
  signIn: mocks.signIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SigninPage from "./signin/page";
import SignupPage from "./signup/page";

function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function changeSelect(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("authentication pages", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.signIn.mockResolvedValue({ ok: true });
    mocks.getSession.mockResolvedValue({
      user: { quickAccessClubId: "club-1" },
    });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    container.remove();
    document.body.innerHTML = "";
  });

  it("places the sign-in controls first in mobile reading order", async () => {
    await act(async () => root.render(<SigninPage />));

    const sections = container.querySelectorAll("main section");
    expect(sections[0]?.textContent).toContain("Welcome back");
    expect(sections[0]?.className).toContain("order-1");
    expect(sections[1]?.textContent).toContain(
      "Your club, courts, and standings"
    );
  });

  it("returns an account sign-in to its sanitized callback URL", async () => {
    mocks.searchParams = new URLSearchParams({
      callbackUrl: "/club/club-1?tab=host",
    });
    await act(async () => root.render(<SigninPage />));

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    await act(async () => {
      changeInput(inputs[0], "player@example.com");
      changeInput(inputs[1], "password123");
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.signIn).toHaveBeenCalledWith("credentials", {
      email: "player@example.com",
      password: "password123",
      redirect: false,
    });
    expect(mocks.replace).toHaveBeenCalledWith("/club/club-1?tab=host");
  });

  it("explains Quick access restrictions and falls back to its own club", async () => {
    mocks.searchParams = new URLSearchParams({ callbackUrl: "/settings" });
    await act(async () => root.render(<SigninPage />));

    const quickButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Quick access"
    );
    await act(async () => quickButton?.click());

    expect(container.textContent).toContain("Quick access is view-only");

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    await act(async () => {
      changeInput(inputs[0], "Net Players");
      changeInput(inputs[1], "Sam");
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.replace).toHaveBeenCalledWith("/club/club-1");
  });

  it("validates an eight-character signup password before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<SignupPage />));

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    const gender = container.querySelector<HTMLSelectElement>("form select");
    await act(async () => {
      changeInput(inputs[0], "Sam Player");
      changeInput(inputs[1], "sam@example.com");
      if (gender) changeSelect(gender, "MALE");
      changeInput(inputs[2], "short");
      changeInput(inputs[3], "short");
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Password must be at least 8 characters"
    );
    expect(document.activeElement).toBe(inputs[2]);
  });

  it("clears a password mismatch when either password is corrected", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<SignupPage />));

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    const gender = container.querySelector<HTMLSelectElement>("form select");
    await act(async () => {
      changeInput(inputs[0], "Sam Player");
      changeInput(inputs[1], "sam@example.com");
      if (gender) changeSelect(gender, "FEMALE");
      changeInput(inputs[2], "password123");
      changeInput(inputs[3], "password124");
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("Passwords do not match");
    expect(inputs[3].getAttribute("aria-invalid")).toBe("true");

    await act(async () => changeInput(inputs[2], "password124"));

    expect(container.textContent).not.toContain("Passwords do not match");
    expect(inputs[3].hasAttribute("aria-invalid")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a safe callback through signup", async () => {
    mocks.searchParams = new URLSearchParams({
      callbackUrl: "/session/ABC123?tab=standings",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "user-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
    );
    await act(async () => root.render(<SignupPage />));

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    const gender = container.querySelector<HTMLSelectElement>("form select");
    await act(async () => {
      changeInput(inputs[0], "Sam Player");
      changeInput(inputs[1], "sam@example.com");
      if (gender) changeSelect(gender, "MALE");
      changeInput(inputs[2], "password123");
      changeInput(inputs[3], "password123");
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.push).toHaveBeenCalledWith(
      "/signin?registered=true&callbackUrl=%2Fsession%2FABC123%3Ftab%3Dstandings"
    );
  });

  it("requires gender for Mixed pairing during signup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<SignupPage />));

    const inputs = container.querySelectorAll<HTMLInputElement>("form input");
    await act(async () => {
      changeInput(inputs[0], "Sam Player");
      changeInput(inputs[1], "sam@example.com");
      changeInput(inputs[2], "password123");
      changeInput(inputs[3], "password123");
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Choose your gender for Mixed pairing"
    );
    expect(document.activeElement).toBe(
      container.querySelector("form select")
    );
  });
});
