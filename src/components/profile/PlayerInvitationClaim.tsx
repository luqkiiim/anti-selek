"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { withCallbackUrl } from "@/lib/authCallback";
import { api } from "@/components/prototype/api";

type Context = { player: { name: string; avatarUrl: string | null; rating: number; matchesPlayed: number; lastPlayedAt: string | null }; club: { id: string; name: string } };
export function PlayerInvitationClaim({ invitationId }: { invitationId: string }) {
  const path = `/player-invites/${encodeURIComponent(invitationId)}`;
  const endpoint = `/api${path}`;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bootstrap = useRef<Promise<Context> | null>(null);
  useEffect(() => {
    let cancelled = false;
    function load() {
      // Capture once (also under StrictMode), remove immediately, then exchange.
      const secret = location.hash.slice(1);
      if (location.hash) history.replaceState(history.state, "", path);
      if (secret || !bootstrap.current) bootstrap.current = (async () => {
          if (secret) await api(`${endpoint}/exchange`, "POST", { secret });
          return api<Context>(endpoint);
        })();
      const operation = bootstrap.current;
      void operation.then(value => {
        if (!cancelled && operation === bootstrap.current) { setContext(value); setError(""); }
      }).catch(error => {
        if (!cancelled && operation === bootstrap.current) setError(error instanceof Error ? error.message : "This invitation is unavailable. Reopen the original link, or ask a club admin for a new one.");
      });
    }
    load();
    window.addEventListener("hashchange", load);
    return () => { cancelled = true; window.removeEventListener("hashchange", load); };
  }, [endpoint, path]);
  async function claim() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ destination: string }>(`${endpoint}/redeem`, "POST", { confirm: true });
      router.replace(result.destination);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to claim this profile. Ask a club admin for help.");
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
  const quickAccess = !!session?.user?.isQuickAccess;
  return <main className="mx-auto max-w-lg space-y-5 p-6">
    <Link href="/">Anti-Selek</Link>
    <h1 className="text-2xl font-bold">You&apos;ve been invited to claim this Player profile</h1>
    {error && <p role="alert">{error}</p>}
    {!context && !error && <p role="status">Loading invitation…</p>}
    {context && <>
      <section className="app-panel space-y-3 p-5" aria-label="Invited Player">
        {context.player.avatarUrl && <Image src={context.player.avatarUrl} alt="" width={80} height={80} unoptimized />}
        <h2 className="text-xl font-bold">{context.player.name}</h2>
        <p>{context.club.name}</p>
        <p>Rating {context.player.rating} · {context.player.matchesPlayed} matches</p>
        {context.player.lastPlayedAt && <p>Last played {new Date(context.player.lastPlayedAt).toLocaleDateString()}</p>}
      </section>
      {status === "loading" ? <p>Checking account…</p> : status === "unauthenticated" ? <>
        <Link className="app-button-primary px-4 py-2" href={withCallbackUrl("/signin", path)}>Sign in to claim</Link>
        <Link className="app-button-secondary px-4 py-2" href={withCallbackUrl("/signup", path)}>Create an account</Link>
      </> : <>
        <p>You&apos;re claiming as: <strong>{session?.user?.name}</strong></p>
        {quickAccess ? <p>Quick access cannot claim a profile. Sign in with an account.</p> : <button className="app-button-primary px-4 py-2" type="button" disabled={busy} onClick={() => void claim()}>{busy ? "Claiming…" : "Claim my profile"}</button>}
        <button className="app-button-secondary px-4 py-2" type="button" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>
      </>}
      <p>Your existing Player history and rating stay with this profile.</p>
    </>}
  </main>;
}
