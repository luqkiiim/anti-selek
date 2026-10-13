"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { withCallbackUrl } from "@/lib/authCallback";
import { api } from "@/components/prototype/api";
import type {
  AuthorizedInvitationContext,
  GenericInvitationContext,
  InvitationExecutionReceipt,
  UnavailableClaimInvitationContext,
} from "@/types/playerRecovery";

type ClaimContext = {
  purpose?: "CLAIM";
  player: {
    id?: string;
    name: string;
    avatarUrl: string | null;
    rating: number;
    matchesPlayed: number;
    lastPlayedAt: string | null;
  };
  club: { id: string; name: string };
};

type InvitationContext =
  | ClaimContext
  | UnavailableClaimInvitationContext
  | AuthorizedInvitationContext
  | GenericInvitationContext;

function isClaimContext(value: InvitationContext | null): value is ClaimContext {
  return !!value && "player" in value;
}

function isUnavailableClaimContext(
  value: InvitationContext | null
): value is UnavailableClaimInvitationContext {
  return (
    !!value &&
    "purpose" in value &&
    value.purpose === "CLAIM" &&
    !("player" in value)
  );
}

function isLegacyIdentityContext(
  value: InvitationContext | null
): value is AuthorizedInvitationContext {
  return (
    !!value &&
    "status" in value &&
    value.status === "MATCHED" &&
    "purpose" in value
  );
}

function isGenericInvitationContext(
  value: InvitationContext | null
): value is GenericInvitationContext {
  return (
    !!value &&
    "status" in value &&
    value.status !== "MATCHED" &&
    !("purpose" in value)
  );
}

function accessText(snapshot: InvitationExecutionReceipt["accessAfter"]) {
  return `${snapshot.status}${snapshot.role ? ` · ${snapshot.role}` : ""}`;
}

function HistoricalInvitationReceipt({
  context,
}: {
  context: AuthorizedInvitationContext;
}) {
  const receipt = context.completedReceipt;
  if (!receipt) {
    return (
      <section className="app-panel space-y-3 p-5" aria-label="Older invitation">
        <h2 className="text-xl font-bold">This older invitation is no longer active</h2>
        <p>
          Older correction and access-restoration invitations can no longer change profile ownership or club access.
          Ask a club admin to remove the profile from this club, then invite the correct profile.
        </p>
      </section>
    );
  }

  return (
    <section className="app-panel space-y-3 p-5" aria-label="Completed historical invitation">
      <h2 className="text-xl font-bold">Historical invitation completed</h2>
      <p>
        This older {context.purpose === "CORRECTION" ? "profile correction" : "access restoration"} was completed on{" "}
        {new Date(receipt.confirmedAt).toLocaleString()}.
      </p>
      <p>
        Club profile {receipt.targetPlayerId} and its recorded history remain preserved.
        {receipt.sourceRetired && receipt.sourcePlayerId
          ? ` Source profile ${receipt.sourcePlayerId} was retired with its history retained.`
          : ""}
      </p>
      <p>
        Access outcome: {receipt.accessOutcome}. Access before: {accessText(receipt.accessBefore)}; after: {accessText(receipt.accessAfter)}.
      </p>
      <Link className="app-button-primary inline-block px-4 py-2" href={receipt.destination}>
        Continue to club
      </Link>
    </section>
  );
}

export function PlayerInvitationClaim({ invitationId }: { invitationId: string }) {
  const path = `/player-invites/${encodeURIComponent(invitationId)}`;
  const endpoint = `/api${path}`;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [context, setContext] = useState<InvitationContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bootstrap = useRef<Promise<InvitationContext> | null>(null);
  const claimContext = isClaimContext(context) ? context : null;
  const unavailableContext = isUnavailableClaimContext(context) ? context : null;
  const genericContext = isGenericInvitationContext(context) ? context : null;
  const legacyContext = isLegacyIdentityContext(context) ? context : null;

  useEffect(() => {
    let cancelled = false;
    function load() {
      const secret = location.hash.slice(1);
      if (location.hash) history.replaceState(history.state, "", path);
      if (secret || !bootstrap.current) {
        bootstrap.current = (async () => {
          if (secret) await api(`${endpoint}/exchange`, "POST", { secret });
          return api<InvitationContext>(endpoint);
        })();
      }
      const operation = bootstrap.current;
      void operation
        .then((value) => {
          if (!cancelled && operation === bootstrap.current) {
            setContext(value);
            setError("");
          }
        })
        .catch((loadError) => {
          if (!cancelled && operation === bootstrap.current) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "This invitation is unavailable. Ask a club admin for a new one."
            );
          }
        });
    }
    load();
    window.addEventListener("hashchange", load);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", load);
    };
  }, [endpoint, path]);

  async function claim() {
    if (lock.current || !claimContext) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ clubId: string; playerId: string; destination: string }>(
        `${endpoint}/redeem`,
        "POST",
        { confirm: true }
      );
      router.replace(`/?club=${encodeURIComponent(result.clubId)}&tab=profile`);
      router.refresh();
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "Unable to claim this profile. Ask a club admin for help."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    try {
      await signOut({ redirect: false });
      router.replace(withCallbackUrl("/signin", path));
      router.refresh();
    } catch {
      setError("Unable to switch accounts. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const quickAccess = !!session?.user?.isQuickAccess;

  return (
    <main className="mx-auto max-w-lg space-y-5 p-6">
      <Link href="/">Anti-Selek</Link>
      <h1 className="text-2xl font-bold">
        {claimContext
          ? "Claim your club profile"
          : legacyContext?.completedReceipt
            ? "Invitation record"
            : "Player invitation"}
      </h1>
      {error ? <p role="alert">{error}</p> : null}
      {!context && !error ? <p role="status">Loading invitation…</p> : null}
      {unavailableContext ? (
        <section className="app-panel space-y-3 p-5" aria-label="Invitation unavailable">
          <p>{unavailableContext.message}</p>
          {status === "unauthenticated" ? (
            <Link className="app-button-secondary inline-block px-4 py-2" href={withCallbackUrl("/signin", path)}>
              Sign in to continue
            </Link>
          ) : null}
        </section>
      ) : null}
      {genericContext ? (
        <section className="app-panel space-y-3 p-5" aria-label="Invitation account required">
          <p>{genericContext.message}</p>
          {status === "unauthenticated" ? (
            <Link className="app-button-primary inline-block px-4 py-2" href={withCallbackUrl("/signin", path)}>
              Sign in to continue
            </Link>
          ) : null}
          {status === "authenticated" ? (
            <button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void switchAccount()}>
              Switch account
            </button>
          ) : null}
        </section>
      ) : null}
      {legacyContext ? <HistoricalInvitationReceipt context={legacyContext} /> : null}
      {claimContext ? (
        <>
          <section className="app-panel space-y-3 p-5" aria-label="Invited club profile">
            {claimContext.player.avatarUrl ? (
              <Image src={claimContext.player.avatarUrl} alt="" width={80} height={80} unoptimized />
            ) : null}
            <h2 className="text-xl font-bold">{claimContext.player.name}</h2>
            <p>{claimContext.club.name}</p>
            <p>Rating {claimContext.player.rating} · {claimContext.player.matchesPlayed} matches</p>
            {claimContext.player.lastPlayedAt ? (
              <p>Last played {new Date(claimContext.player.lastPlayedAt).toLocaleDateString()}</p>
            ) : null}
          </section>
          {status === "loading" ? <p>Checking account…</p> : null}
          {status === "unauthenticated" ? (
            <div className="flex flex-wrap gap-3">
              <Link className="app-button-primary px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to claim</Link>
              <Link className="app-button-secondary px-4 py-2" href={withCallbackUrl("/signup", path)}>Create an account</Link>
            </div>
          ) : null}
          {status === "authenticated" ? (
            <section className="app-panel-muted space-y-3 p-4">
              <p>You&apos;re claiming as <strong>{session?.user?.name}</strong>.</p>
              <p className="text-sm text-gray-600">
                Your account photo takes priority; if you have none, this profile&apos;s photo is used. Match history and rating stay with this profile.
              </p>
              {quickAccess ? (
                <p>Quick access cannot claim a profile. Sign in with a full account.</p>
              ) : (
                <button className="app-button-primary px-4 py-2" type="button" disabled={busy} onClick={() => void claim()}>
                  {busy ? "Working…" : "Claim my profile"}
                </button>
              )}
              <button className="app-button-secondary px-4 py-2" type="button" disabled={busy} onClick={() => void switchAccount()}>
                Switch account
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
