"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { FlashMessage, HeroCard, SectionCard } from "@/components/ui/chrome";
import { deleteUserAvatar, uploadUserAvatar } from "@/lib/avatarClient";
import { normalizeNameLookupKey } from "@/lib/quickAccess";

interface CurrentUserSettingsPayload {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    isClaimed: boolean;
    isQuickAccess: boolean;
    selfNameChangedAt: string | null;
    canRenameName: boolean;
  };
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function safeJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

function getResponseError(payload: unknown, fallback: string) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

export default function SettingsPage() {
  const { status, update } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUserSettingsPayload["user"] | null>(
    null
  );
  const [draftName, setDraftName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [nameError, setNameError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setPageError("");

        const response = await fetch("/api/user/me");
        const payload = (await safeJson(response)) as Partial<CurrentUserSettingsPayload>;

        if (!response.ok || !payload.user) {
          throw new Error(getResponseError(payload, "Failed to load settings"));
        }

        if (!cancelled) {
          setUser(payload.user);
          setDraftName(payload.user.name);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : "Failed to load settings"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const isFullAccount = !!user && user.isClaimed && !user.isQuickAccess;
  const trimmedDraftName = draftName.trim();
  const hasNameChange = !!user && trimmedDraftName !== user.name;
  const renameUsedLabel = useMemo(
    () => formatTimestamp(user?.selfNameChangedAt ?? null),
    [user?.selfNameChangedAt]
  );

  const handleSaveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      return;
    }

    setPageError("");
    setSuccessMessage("");
    setNameError("");

    if (!isFullAccount) {
      setNameError("Only full accounts can change player names.");
      return;
    }

    if (!normalizeNameLookupKey(trimmedDraftName)) {
      setNameError("Player name must include letters or numbers.");
      return;
    }

    if (!hasNameChange) {
      setSuccessMessage("Your player name is already up to date.");
      return;
    }

    setSavingName(true);

    try {
      const response = await fetch("/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedDraftName,
        }),
      });
      const payload = (await safeJson(response)) as Partial<CurrentUserSettingsPayload>;

      if (!response.ok || !payload.user) {
        throw new Error(getResponseError(payload, "Failed to update player name"));
      }

      setUser(payload.user);
      setDraftName(payload.user.name);
      setSuccessMessage("Player name updated.");

      try {
        await update({ name: payload.user.name });
      } catch {
        // The database state is already updated; failing to refresh the client
        // session should not surface as a hard error to the player.
      }

      router.refresh();
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Failed to update player name"
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleUploadAvatar = async (file: File) => {
    if (!user) {
      throw new Error("Settings are still loading.");
    }

    const response = await uploadUserAvatar(user.id, file);
    setUser((current) =>
      current
        ? {
            ...current,
            avatarUrl: response.avatarUrl,
          }
        : current
    );
    setSuccessMessage("Profile photo updated.");
    setPageError("");
    router.refresh();
  };

  const handleRemoveAvatar = async () => {
    if (!user) {
      throw new Error("Settings are still loading.");
    }

    await deleteUserAvatar(user.id);
    setUser((current) =>
      current
        ? {
            ...current,
            avatarUrl: null,
          }
        : current
    );
    setSuccessMessage("Profile photo removed.");
    setPageError("");
    router.refresh();
  };

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel px-8 py-8">
          <p className="app-eyebrow">Loading settings</p>
        </div>
      </div>
    );
  }

  if (pageError && !user) {
    return (
      <main className="app-page">
        <div className="app-shell-narrow space-y-6">
          <HeroCard
            eyebrow="Player settings"
            title="Account settings"
            description="Manage the name and avatar tied to your full player account."
            backHref="/"
          />
          <FlashMessage tone="error">{pageError}</FlashMessage>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="app-page">
      <div className="app-shell-narrow space-y-6">
        <HeroCard
          eyebrow="Player settings"
          title="Account settings"
          description="Manage the global player identity tied to your full account."
          backHref="/"
        />

        {successMessage ? (
          <FlashMessage tone="success">{successMessage}</FlashMessage>
        ) : null}
        {pageError ? <FlashMessage tone="error">{pageError}</FlashMessage> : null}

        {!isFullAccount ? (
          <SectionCard
            eyebrow="Unavailable"
            title="Settings require a full account"
            description="Quick-access profiles and placeholder accounts cannot manage global player settings."
          >
            <Link href="/" className="app-button-secondary px-4 py-2">
              Return home
            </Link>
          </SectionCard>
        ) : (
          <>
            <SectionCard
              eyebrow="Display name"
              title="One-time player rename"
              description="This updates the name shown across your profile, communities, and sessions."
              action={
                <span
                  className={`app-chip ${
                    user.canRenameName
                      ? "app-chip-warning"
                      : "app-chip-neutral"
                  }`}
                >
                  {user.canRenameName ? "1 rename left" : "Rename used"}
                </span>
              }
            >
              <form onSubmit={handleSaveName} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="player-name"
                    className="text-sm font-semibold text-gray-900"
                  >
                    Player name
                  </label>
                  <input
                    id="player-name"
                    type="text"
                    value={draftName}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                      setNameError("");
                      setSuccessMessage("");
                    }}
                    disabled={!user.canRenameName || savingName}
                    className="field"
                    maxLength={80}
                  />
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    Choose carefully. You can only change your player name once
                    from this page.
                  </p>
                  {user.canRenameName ? (
                    <p>Your avatar can be updated separately at any time.</p>
                  ) : renameUsedLabel ? (
                    <p>Your one-time rename was used on {renameUsedLabel}.</p>
                  ) : (
                    <p>Your one-time rename has already been used.</p>
                  )}
                </div>

                {nameError ? (
                  <p className="text-sm font-semibold text-rose-600">
                    {nameError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={
                    savingName ||
                    !user.canRenameName ||
                    !normalizeNameLookupKey(trimmedDraftName) ||
                    !hasNameChange
                  }
                  className="app-button-primary px-4 py-2"
                >
                  {savingName ? "Saving..." : "Save player name"}
                </button>
              </form>
            </SectionCard>

            <SectionCard
              eyebrow="Avatar"
              title="Profile photo"
              description="Upload, crop, replace, or remove the avatar tied to your player account."
            >
              <AvatarUploader
                name={user.name}
                avatarUrl={user.avatarUrl}
                helperText="Use a clear photo so other players can recognize you across communities and sessions."
                onUpload={handleUploadAvatar}
                onRemove={handleRemoveAvatar}
              />
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}
