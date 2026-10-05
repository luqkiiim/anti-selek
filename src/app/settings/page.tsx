"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { FlashMessage, HeroCard, SectionCard } from "@/components/ui/chrome";
import { deleteAccountAvatar, uploadAccountAvatar } from "@/lib/avatarClient";
import { getCurrentAppPath, withCallbackUrl } from "@/lib/authCallback";
import { normalizeNameLookupKey } from "@/lib/quickAccess";
import { PlayerGender } from "@/types/enums";

interface CurrentUserSettingsPayload {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    isClaimed: boolean;
    isQuickAccess: boolean;
    selfNameChangedAt: string | null;
    canRenameName: boolean;
    gender: PlayerGender;
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
  const [savingGender, setSavingGender] = useState(false);
  const [genderError, setGenderError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        withCallbackUrl("/signin", getCurrentAppPath(window.location))
      );
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
      setNameError("Only full accounts can change account names.");
      return;
    }

    if (!normalizeNameLookupKey(trimmedDraftName)) {
      setNameError("Account name must include letters or numbers.");
      return;
    }

    if (!hasNameChange) {
      setSuccessMessage("Your account name is already up to date.");
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
        throw new Error(getResponseError(payload, "Failed to update account name"));
      }

      setUser(payload.user);
      setDraftName(payload.user.name);
      setSuccessMessage("Account name updated.");

      try {
        await update({ name: payload.user.name });
      } catch {
        // The database state is already updated; failing to refresh the client
        // session should not surface as a hard error to the player.
      }

      router.refresh();
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Failed to update account name"
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleUploadAvatar = async (file: File) => {
    if (!user) {
      throw new Error("Settings are still loading.");
    }

    const response = await uploadAccountAvatar(file);
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

  const handleSaveGender = async (gender: PlayerGender) => {
    if (!user || savingGender) return;

    setPageError("");
    setSuccessMessage("");
    setGenderError("");
    setSavingGender(true);
    try {
      const response = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender }),
      });
      const payload = (await safeJson(response)) as Partial<CurrentUserSettingsPayload>;
      if (!response.ok || !payload.user) {
        throw new Error(getResponseError(payload, "Failed to update gender"));
      }

      setUser(payload.user);
      setSuccessMessage("Account gender updated.");
      router.refresh();
    } catch (error) {
      setGenderError(
        error instanceof Error ? error.message : "Failed to update gender"
      );
    } finally {
      setSavingGender(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) {
      throw new Error("Settings are still loading.");
    }

    await deleteAccountAvatar();
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
            eyebrow="Account settings"
            title="Account settings"
            description="Manage the name, gender, and photo on your account."
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
          eyebrow="Account settings"
          title="Account settings"
          description="Manage account details. These settings do not change your sporting profiles."
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
            description="Quick-access profiles and placeholder accounts cannot manage account settings."
          >
            <Link href="/" className="app-button-secondary px-4 py-2">
              Return home
            </Link>
          </SectionCard>
        ) : (
          <>
            <SectionCard
              eyebrow="Account detail"
              title="Account gender"
              description="This is account metadata. Sporting profiles keep their own gender and mixed-pairing preferences."
              action={
                <span
                  className={`app-chip ${
                    user.gender === PlayerGender.UNSPECIFIED
                      ? "app-chip-warning"
                      : "app-chip-neutral"
                  }`}
                >
                  {user.gender === PlayerGender.UNSPECIFIED
                    ? "Required"
                    : "Saved"}
                </span>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[PlayerGender.MALE, PlayerGender.FEMALE].map((gender) => {
                    const selected = user.gender === gender;
                    return (
                      <button
                        key={gender}
                        type="button"
                        aria-pressed={selected}
                        disabled={savingGender}
                        onClick={() => void handleSaveGender(gender)}
                        className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          selected
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-700 hover:border-blue-200"
                        }`}
                      >
                        {gender === PlayerGender.FEMALE ? "Female" : "Male"}
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-gray-600">
                  This value does not update a Player profile or affect
                  tournament pairing.
                </p>
                {genderError ? (
                  <p className="text-sm font-semibold text-rose-600">
                    {genderError}
                  </p>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Account detail"
              title="One-time account name change"
              description="This changes your account display name. Sporting profile names are managed separately."
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
                    htmlFor="account-name"
                    className="text-sm font-semibold text-gray-900"
                  >
                    Account name
                  </label>
                  <input
                    id="account-name"
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
                    Choose carefully. You can only change your account name once
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
                  {savingName ? "Saving..." : "Save account name"}
                </button>
              </form>
            </SectionCard>

            <SectionCard
              eyebrow="Avatar"
              title="Account photo"
              description="Upload, crop, replace, or remove your account photo. Sporting profile photos are managed on each Player profile."
            >
              <AvatarUploader
                name={user.name}
                avatarUrl={user.avatarUrl}
                helperText="This photo represents your account. Player profiles have separate photos. We compress the final crop before saving."
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
