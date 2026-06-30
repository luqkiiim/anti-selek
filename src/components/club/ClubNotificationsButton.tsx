"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Heart, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { ClubNotificationItem } from "./clubTypes";

const POLL_INTERVAL_MS = 60_000;

function formatDate(value: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatRelativeTime(value: string | null) {
  if (!value) return "";

  const elapsedMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsedMs)) return "";

  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d`;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function ClubNotificationsButton({
  clubId,
  initialUnreadCount,
}: {
  clubId: string;
  initialUnreadCount: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<ClubNotificationItem[]>(
    []
  );

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  const loadUnreadCount = useCallback(async () => {
    if (!clubId || document.visibilityState === "hidden") return;

    const response = await fetch(
      `/api/clubs/${clubId}/notifications?countOnly=1`
    );
    const data = await readJson(response);

    if (response.ok && typeof data.unreadCount === "number") {
      setUnreadCount(data.unreadCount);
    }
  }, [clubId]);

  const markNotificationsRead = useCallback(async () => {
    const response = await fetch(`/api/clubs/${clubId}/notifications/read`, {
      method: "POST",
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.error || "Failed to mark notifications read");
    }

    setUnreadCount(0);
  }, [clubId]);

  const loadNotifications = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/clubs/${clubId}/notifications`);
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Failed to load notifications");
      }

      setNotifications(
        Array.isArray(data.notifications)
          ? (data.notifications as ClubNotificationItem[])
          : []
      );
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }

      if (typeof data.unreadCount === "number" && data.unreadCount > 0) {
        await markNotificationsRead();
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load notifications"
      );
    } finally {
      setLoading(false);
    }
  }, [clubId, markNotificationsRead]);

  useEffect(() => {
    if (!clubId) return;

    const interval = window.setInterval(() => {
      void loadUnreadCount();
    }, POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clubId, loadUnreadCount]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            void loadNotifications();
          }
        }}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-900 shadow-[0_12px_28px_rgba(23,32,31,0.06)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
      >
        <Bell aria-hidden="true" size={21} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="absolute right-0 top-full z-50 mt-2 grid max-h-[min(31rem,76vh)] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(23,32,31,0.2)]">
          <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
            <h3 className="text-base font-semibold text-gray-950">
              Notifications
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              aria-label="Close notifications"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="min-h-0 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-5 text-center text-sm font-medium text-gray-500">
                Loading
              </div>
            ) : error ? (
              <div className="px-4 py-5 text-center text-sm font-medium text-red-600">
                {error}
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => (
                <article
                  key={notification.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0"
                >
                  <Avatar
                    name={notification.actor.name}
                    avatarUrl={notification.actor.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium text-gray-950">
                        <span>{notification.actor.name}</span>
                        <span className="text-gray-500"> liked your news</span>
                      </p>
                      <span className="shrink-0 text-xs font-medium text-gray-400">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                        <Heart aria-hidden="true" size={15} fill="currentColor" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-950">
                          {notification.title}
                        </p>
                        <p className="truncate text-xs font-medium text-gray-500">
                          {notification.detail} · {notification.value}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-gray-500">
                      {notification.session.name} ·{" "}
                      {formatDate(notification.session.date)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="px-4 py-5 text-center text-sm font-medium text-gray-500">
                No notifications yet
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
