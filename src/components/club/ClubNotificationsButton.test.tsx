// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubNotificationsButton } from "./ClubNotificationsButton";

let container: HTMLDivElement;
let root: Root;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ClubNotificationsButton", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens notifications, marks unread items read, and closes outside", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/notifications/read")) {
        return jsonResponse({ unreadCount: 0 });
      }

      return jsonResponse({
        unreadCount: 2,
        notifications: [
          {
            id: "notification-1",
            type: "NEWS_LIKE",
            newsItemId: "session-1:rating_jump:player-1",
            newsType: "RATING_JUMP",
            title: "Player One",
            detail: "Biggest rating jump",
            value: "+24 rating",
            readAt: null,
            createdAt: new Date().toISOString(),
            actor: {
              id: "actor-1",
              name: "Actor One",
              avatarUrl: null,
            },
            session: {
              id: "session-1",
              code: "ABCD",
              name: "Friday Mexicano",
              date: "2026-06-30T09:00:00.000Z",
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <ClubNotificationsButton
          clubId="club-1"
          initialUnreadCount={2}
        />
      );
    });

    const button = container.querySelector(
      'button[aria-label="2 unread notifications"]'
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(container.textContent).toContain("Notifications");
    expect(container.textContent).toContain("Actor One");
    expect(container.textContent).toContain("liked your news");
    expect(container.textContent).toContain("Biggest rating jump · +24 rating");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clubs/club-1/notifications/read",
      { method: "POST" }
    );
    expect(
      container.querySelector('button[aria-label="Notifications"]')
    ).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("Actor One");
  });

  it("shows an empty state when there are no notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          unreadCount: 0,
          notifications: [],
        })
      )
    );

    await act(async () => {
      root.render(
        <ClubNotificationsButton
          clubId="club-1"
          initialUnreadCount={0}
        />
      );
    });

    const button = container.querySelector(
      'button[aria-label="Notifications"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(container.textContent).toContain("No notifications yet");
  });
});
