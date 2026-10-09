"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { withCallbackUrl } from "@/lib/authCallback";
import { api, ApiError } from "@/components/prototype/api";
import type {
  AuthorizedInvitationContext,
  GenericInvitationContext,
  InvitationExecutionReceipt,
  RecoveryStatus,
  SupersedeRecoveryRequestInput,
  UnavailableClaimInvitationContext,
} from "@/types/playerRecovery";

type ClaimContext = { purpose?: "CLAIM"; player: { id?: string; name: string; avatarUrl: string | null; rating: number; matchesPlayed: number; lastPlayedAt: string | null }; club: { id: string; name: string } };
type InvitationContext = ClaimContext | UnavailableClaimInvitationContext | AuthorizedInvitationContext | GenericInvitationContext;

function isClaimContext(value: InvitationContext | null): value is ClaimContext {
  return !!value && "player" in value;
}

function isUnavailableClaimContext(value: InvitationContext | null): value is UnavailableClaimInvitationContext {
  return !!value && "purpose" in value && value.purpose === "CLAIM" && !("player" in value);
}

function isGenericInvitationContext(value: InvitationContext | null): value is GenericInvitationContext {
  return !!value && "status" in value && value.status !== "MATCHED" && !("purpose" in value);
}

function accessText(snapshot: InvitationExecutionReceipt["accessAfter"]) {
  return `${snapshot.status}${snapshot.role ? ` · ${snapshot.role}` : ""}`;
}

function receiptAccessOutcome(receipt: InvitationExecutionReceipt) {
  switch (receipt.accessOutcome) {
    case "PRESERVED_ACTIVE": return "Existing active club access was preserved.";
    case "GRANTED_MEMBER": return "Club access was granted as MEMBER.";
    case "RESTORED_MEMBER": return "Revoked club access was restored as MEMBER.";
    default: return "Club access was unchanged.";
  }
}

function AuthorizedReceipt({ context }: { context: AuthorizedInvitationContext }) {
  const receipt = context.completedReceipt;
  if (!receipt) return null;
  return <section className="app-panel space-y-3 p-5" aria-label="Completed identity action">
    <h2 className="text-xl font-bold">{context.purpose === "CORRECTION" ? "Profile correction completed" : "Access restoration completed"}</h2>
    <p>Confirmed by Account {context.recipient.accountRef} (ID {receipt.actorAccountId}) at {new Date(receipt.confirmedAt).toLocaleString()}.</p>
    <p>Authorized by {context.authorizedBy.displayName} (Account ID {receipt.authorizedByAccountId}) at {new Date(receipt.authorizedAt).toLocaleString()}.</p>
    <p>Player {receipt.targetPlayerId} remains the permanent profile for this Account. {context.purpose === "ACCESS_RESTORE" ? "No Player was created or reassigned." : "The source Player remains owned by this Account and was not merged."}</p>
    {receipt.sourceRetired && receipt.sourcePlayerId && <p>Source Player {receipt.sourcePlayerId} was retired with its ownership and history retained.</p>}
    <p>{receiptAccessOutcome(receipt)} Access before: {accessText(receipt.accessBefore)}; after: {accessText(receipt.accessAfter)}.</p>
    <p>{receipt.rosterOutcome === "UNARCHIVED_EXISTING" ? "The existing roster membership was unarchived." : "The existing roster membership was left unchanged."}</p>
    {receipt.supersededRecoveryRequest && <p>Pending recovery request {receipt.supersededRecoveryRequest.requestId} (revision {receipt.supersededRecoveryRequest.previousRevision}) was canceled at revision {receipt.supersededRecoveryRequest.cancelledRevision}. Prior invitation {receipt.supersededRecoveryRequest.originInvitationId}; cancellation event {receipt.supersededRecoveryRequest.cancellationEventId}.</p>}
    <Link className="app-button-primary inline-block px-4 py-2" href={receipt.destination}>Continue to club</Link>
  </section>;
}

function AuthorizedInvitationReview({
  context,
  busy,
  error,
  onConfirm,
}: {
  context: AuthorizedInvitationContext;
  busy: boolean;
  error: string;
  onConfirm: (supersedeRecoveryRequest?: SupersedeRecoveryRequestInput) => void;
}) {
  const [supersedeConfirmed, setSupersedeConfirmed] = useState(false);
  if (context.completedReceipt) return <AuthorizedReceipt context={context} />;
  const supersedableRecoveryRequest = context.supersedableRecoveryRequest;
  const accessOutcome = context.authorizedAccessAction === "PRESERVE_ACTIVE"
    ? "Preserve the existing active access and its role."
    : context.authorizedAccessAction === "RESTORE_MEMBER"
      ? "Restore revoked access as MEMBER; a previous elevated role will not be reinstated."
      : "Grant club access as MEMBER.";
  const rosterOutcome = context.restoreArchivedRoster
    ? "Unarchive the exact existing roster membership."
    : "Leave the existing roster membership unchanged.";
  const canConfirm = context.target.isActive
    && (!supersedableRecoveryRequest || supersedeConfirmed);

  return <section className="app-panel space-y-4 p-5" aria-label="Authorized identity change review">
    <h2 className="text-xl font-bold">{context.purpose === "CORRECTION" ? "Confirm an approved Player correction" : "Confirm access restoration"}</h2>
    <p>Signed in as Account {context.recipient.accountRef} ({context.recipient.displayName}) · ID {context.recipient.accountId}.</p>
    <p>Authorized by {context.authorizedBy.displayName} · Account ID {context.authorizedBy.accountId} · {new Date(context.authorizedBy.authorizedAt).toLocaleString()}.</p>
    <p>Club: {context.club.name} · ID {context.club.id} · invitation expires {new Date(context.expiresAt).toLocaleString()}.</p>
    <div className="rounded border border-gray-200 p-3">
      <strong>Exact original Player</strong>
      <p>{context.target.name} · ID {context.target.playerId} · rating {context.target.rating} · {context.target.history.matchesPlayed} matches</p>
      <p>Last played {context.target.history.lastPlayedAt ? new Date(context.target.history.lastPlayedAt).toLocaleDateString() : "never recorded"}; roster membership {context.target.member?.memberId ?? "not found"}.</p>
    </div>
    {context.purpose === "CORRECTION" && context.source && <div className="rounded border border-amber-200 p-3">
      <strong>Source Player to retire after confirmation</strong>
      <p>{context.source.name} · ID {context.source.playerId} · {context.source.isActive ? "active Player" : "inactive Player"} · membership {context.source.member.memberId} ({context.source.member.archivedAt ? "archived" : "active"}) · rating {context.source.rating} · {context.source.history.matchesPlayed} matches</p>
      <p>Its Account ownership and sporting history will remain attached to it. No history will be merged.</p>
    </div>}
    <div className="space-y-1">
      <p><strong>Administrator’s reason:</strong> {context.reason}</p>
      <p>{accessOutcome}</p>
      <p>{rosterOutcome}</p>
      {context.purpose === "ACCESS_RESTORE" && <p>This action will not create, reassign, merge, activate, or retire a Player.</p>}
    </div>
    {supersedableRecoveryRequest && <section className="rounded border border-amber-300 p-3" aria-label="Pending recovery request to cancel">
      <h3 className="font-semibold">An obsolete pending recovery request must be closed</h3>
      <p>Exact request ID {supersedableRecoveryRequest.requestId} · revision {supersedableRecoveryRequest.revision} · original Player {context.target.playerId}.</p>
      <p>Prior invitation ID {supersedableRecoveryRequest.originInvitationId} is {supersedableRecoveryRequest.invitationAvailability.toLowerCase()}.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={supersedeConfirmed} onChange={event => setSupersedeConfirmed(event.target.checked)} />
        <span>Cancel this exact pending request at its displayed revision and complete the approved change in the same transaction.</span>
      </label>
    </section>}
    {!context.target.isActive && <p role="alert">This Player is inactive, so the invitation cannot be completed. Contact the club administrator.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="app-button-primary px-4 py-2" type="button" disabled={!canConfirm || busy} onClick={() => onConfirm(supersedableRecoveryRequest && supersedeConfirmed ? { requestId: supersedableRecoveryRequest.requestId, revision: supersedableRecoveryRequest.revision } : undefined)}>
      {busy ? "Applying approved change…" : context.purpose === "CORRECTION" ? "Confirm Player correction" : "Confirm access restoration"}
    </button>
  </section>;
}

export function PlayerInvitationClaim({ invitationId }: { invitationId: string }) {
  const path = `/player-invites/${encodeURIComponent(invitationId)}`;
  const endpoint = `/api${path}`;
  const { data: session, status } = useSession();
  const accountId = session?.user?.id;
  const router = useRouter();
  const [context, setContext] = useState<InvitationContext | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [recoveryForAccount, setRecoveryForAccount] = useState<{ accountId: string | undefined; data: RecoveryStatus | null } | null>(null);
  const claimContext = isClaimContext(context) ? context : null;
  const unavailableClaimContext = isUnavailableClaimContext(context) ? context : null;
  const claimStatusContext = claimContext ?? unavailableClaimContext;
  const canReadClaimRecoveryStatus = claimStatusContext !== null;
  const recovery = claimStatusContext && recoveryForAccount?.accountId === accountId ? recoveryForAccount?.data : null;
  const submissionKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bootstrap = useRef<Promise<InvitationContext> | null>(null);
  const authorizedContext = context && "status" in context && context.status === "MATCHED" ? context : null;
  const genericContext = isGenericInvitationContext(context) ? context : null;
  useEffect(() => {
    let cancelled = false;
    function load() {
      // Capture once (also under StrictMode), remove immediately, then exchange.
      const secret = location.hash.slice(1);
      if (location.hash) history.replaceState(history.state, "", path);
      if (secret || !bootstrap.current) bootstrap.current = (async () => {
          if (secret) await api(`${endpoint}/exchange`, "POST", { secret });
          return api<InvitationContext>(endpoint);
        })();
      const operation = bootstrap.current;
      void operation.then(value => {
        if (!cancelled && operation === bootstrap.current) { setContext(value); setError(""); }
      }).catch(error => {
        if (!cancelled && operation === bootstrap.current) {
          setErrorCode(error instanceof ApiError ? error.code : undefined);
          setError(error instanceof Error ? error.message : "This invitation is unavailable. Reopen the original link, or ask a club admin for a new one.");
        }
      });
    }
    load();
    window.addEventListener("hashchange", load);
    return () => { cancelled = true; window.removeEventListener("hashchange", load); };
  }, [endpoint, path]);
  const quickAccess = !!session?.user?.isQuickAccess;
  useEffect(() => {
    let cancelled = false;
    // Status is account-bound, independent of a secret or an expired continuation.
    void Promise.resolve().then(async () => {
      if (status !== "authenticated" || quickAccess || !canReadClaimRecoveryStatus) return null;
      return api<RecoveryStatus>(`${endpoint}/recovery-request`);
    }).then(value => { if (!cancelled) setRecoveryForAccount({ accountId, data: value }); }).catch(() => {
      if (!cancelled) setError("Unable to load your recovery status. Refresh to try again.");
    });
    return () => { cancelled = true; };
  }, [endpoint, accountId, status, quickAccess, canReadClaimRecoveryStatus]);
  async function claim() {
    if (lock.current || !claimContext) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ destination: string }>(`${endpoint}/redeem`, "POST", { confirm: true });
      router.replace(result.destination);
      router.refresh();
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : undefined);
      setError(error instanceof Error ? error.message : "Unable to claim this profile. Ask a club admin for help.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function recoveryAction(action: "SUBMIT" | "REFRESH" | "CANCEL") {
    if (lock.current || !claimStatusContext || (action === "SUBMIT" && !claimContext)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (action === "SUBMIT") {
        submissionKey.current ??= crypto.randomUUID();
        setRecoveryForAccount({ accountId, data: await api<RecoveryStatus>(`${endpoint}/recovery-request`, "POST", { idempotencyKey: submissionKey.current }) });
      } else {
        if (action === "CANCEL" && recovery?.request) await api(`/api/clubs/${recovery.request.clubId}/join-requests/${recovery.request.id}`, "PATCH", { action: "CANCEL", revision: recovery.request.revision });
        setRecoveryForAccount({ accountId, data: await api<RecoveryStatus>(`${endpoint}/recovery-request`) });
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update your recovery request."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirmAuthorizedInvitation(supersedeRecoveryRequest?: SupersedeRecoveryRequestInput) {
    if (lock.current || !authorizedContext) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const action = authorizedContext.purpose === "CORRECTION" ? "confirm-correction" : "confirm-access-restore";
      const result = await api<{ receipt: InvitationExecutionReceipt }>(`${endpoint}/${action}`, "POST", {
        confirm: true,
        ...(supersedeRecoveryRequest ? { supersedeRecoveryRequest } : {}),
      });
      setContext({ ...authorizedContext, completedReceipt: result.receipt });
      setErrorCode(undefined);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : undefined);
      setError(error instanceof Error ? error.message : "Unable to complete this approved change. Refresh the invitation or contact the club administrator.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function switchAccount() {
    setBusy(true);
    try {
      // Keep the current origin: an auth server redirect can use an internal host.
      await signOut({ redirect: false });
      router.replace(withCallbackUrl("/signin", path));
      router.refresh();
    } catch { setError("Unable to switch accounts. Please try again."); }
    finally { setBusy(false); }
  }
  const recoveryRequest = recovery?.request;
  const mayRequestReview = !!claimContext && (errorCode === "ACCESS_REVIEW_REQUIRED" || errorCode === "IDENTITY_CONFLICT");
  return <main className="mx-auto max-w-lg space-y-5 p-6">
    <Link href="/">Anti-Selek</Link>
    <h1 className="text-2xl font-bold">{claimContext ? "You’ve been invited to claim this Player profile" : authorizedContext ? (authorizedContext.purpose === "CORRECTION" ? "Approved Player correction" : "Approved access restoration") : "Player invitation"}</h1>
    {error && !recoveryRequest && !authorizedContext && <p role="alert">{error}</p>}
    {unavailableClaimContext && <section className="app-panel space-y-2 p-4" aria-label="Claim invitation unavailable"><p>{unavailableClaimContext.message}</p>{status === "unauthenticated" && <Link className="app-button-secondary inline-block px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to view your request status</Link>}{status === "authenticated" && !recoveryRequest && <p>Your account has no pending or completed request for this invitation.</p>}</section>}
    {!context && !error && !recoveryRequest && <p role="status">Loading invitation…</p>}
    {!context && status === "unauthenticated" && error && <Link className="app-button-secondary px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to view request status</Link>}
    {recoveryRequest && <section className="app-panel space-y-3 p-5" aria-label="Recovery request status">
      <h2 className="text-xl font-bold">Recovery request {recoveryRequest.status.toLowerCase()}</h2>
      <p>{recoveryRequest.targetName} · {recoveryRequest.clubName}</p>
      {error && <p role="alert">{error}</p>}
      {recoveryRequest.status === "PENDING" && <>
        <p>A club admin must review your request before access or ownership can change.</p>
        {recovery?.recovery?.invitationAvailability !== "ACTIVE" && <p role="alert">The original invitation is {recovery?.recovery?.invitationAvailability.toLowerCase()}. Ask an admin for a fresh invitation and submit a new request from that link.</p>}
        <button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void recoveryAction("CANCEL")}>Cancel recovery request</button>
      </>}
      {recoveryRequest.status === "APPROVED" && <><p>Your original Player profile has been connected. Its history and rating are preserved.</p><Link className="app-button-primary px-4 py-2" href={recovery.destination!}>Continue to club</Link></>}
      {(recoveryRequest.status === "CANCELLED" || recoveryRequest.status === "REJECTED") && <p>This request is closed. Ask an admin for a fresh invitation if another review is needed.</p>}
      <button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void recoveryAction("REFRESH")}>Refresh request status</button>
    </section>}
    {genericContext && <section className="app-panel space-y-3 p-5" aria-label="Invitation account required"><p>{(genericContext as GenericInvitationContext).message}</p>{genericContext.status === "ACCOUNT_REQUIRED" && status === "unauthenticated" && <Link className="app-button-primary inline-block px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to continue</Link>}{(genericContext.status === "WRONG_ACCOUNT" || (genericContext.status === "ACCOUNT_REQUIRED" && status === "authenticated")) && status === "authenticated" && <button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>}</section>}
    {authorizedContext && (status === "loading" ? <p>Checking account…</p> : status === "unauthenticated" ? <section className="app-panel space-y-3 p-5"><p>Sign in with the Account this invitation was issued to.</p><Link className="app-button-primary inline-block px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to continue</Link></section> : quickAccess ? <section className="app-panel space-y-3 p-5"><p>Quick access cannot confirm an Account-bound change. Sign in with the intended Account.</p><button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void switchAccount()}>Switch account</button></section> : <AuthorizedInvitationReview context={authorizedContext} busy={busy} error={error} onConfirm={supersede => void confirmAuthorizedInvitation(supersede)} />)}
    {claimContext && <>
      <section className="app-panel space-y-3 p-5" aria-label="Invited Player">
        {claimContext.player.avatarUrl && <Image src={claimContext.player.avatarUrl} alt="" width={80} height={80} unoptimized />}
        <h2 className="text-xl font-bold">{claimContext.player.name}</h2>
        <p>{claimContext.club.name}</p>
        <p>Rating {claimContext.player.rating} · {claimContext.player.matchesPlayed} matches</p>
        {claimContext.player.lastPlayedAt && <p>Last played {new Date(claimContext.player.lastPlayedAt).toLocaleDateString()}</p>}
      </section>
      {status === "loading" ? <p>Checking account…</p> : status === "unauthenticated" ? <>
        <Link className="app-button-primary px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to claim</Link>
        <Link className="app-button-secondary px-4 py-2" href={withCallbackUrl("/signup", path)}>Create an account</Link>
      </> : <>
        <p>You&apos;re claiming as: <strong>{session?.user?.name}</strong></p>
        {quickAccess ? <p>Quick access cannot claim a profile. Sign in with an account.</p> : !recoveryRequest && <>
          <button className="app-button-primary px-4 py-2" type="button" disabled={busy} onClick={() => void claim()}>{busy ? "Working…" : "Claim my profile"}</button>
          {mayRequestReview && <button className="app-button-secondary px-4 py-2" type="button" disabled={busy} onClick={() => void recoveryAction("SUBMIT")}>Request admin review</button>}
        </>}
        <button className="app-button-secondary px-4 py-2" type="button" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>
      </>}
      <p>Your existing Player history and rating stay with this profile.</p>
    </>}
    {!claimContext && recoveryRequest && <button type="button" className="app-button-secondary px-4 py-2" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>}
  </main>;
}
