"use client";

import { useRef, useState } from "react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { adminApi, AdminSaveOutcomeUnknownError } from "@/lib/adminClient";
import { normalizeNameLookupKey } from "@/lib/quickAccess";
import { MixedSide, PlayerGender } from "@/types/enums";
import { ApiError } from "./api";
import { ErrorText } from "./Primitives";
import { MixedPairingControl } from "./MixedPairingControl";
import "./first-session.css";

export interface NewGuestInput {
  name: string;
  gender: PlayerGender;
  initialElo: number;
  mixedSideOverride: MixedSide | null;
  representingClubId?: string;
}

export function NewSessionPlayerForm({ clubs, mode, initialName = "", mixed = false, onSaved, onGuest, onCheckGuest, onCancel, onBusyChange }: {
  clubs: Array<{ id: string; name: string; canSave: boolean }>;
  mode: "setup" | "live" | "club";
  initialName?: string;
  mixed?: boolean;
  onSaved: (member: ClubPageMember, clubId: string) => Promise<void> | void;
  onGuest?: (guest: NewGuestInput) => Promise<void> | void;
  onCheckGuest?: (name: string, clubId: string) => Promise<boolean>;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [clubId, setClubId] = useState(clubs.length === 1 ? clubs[0].id : "");
  const club = clubs.find(item => item.id === clubId);
  const [saveToClub, setSaveToClub] = useState(clubs.some(item => item.canSave));
  const saving = !!club?.canSave && (saveToClub || !onGuest);
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<PlayerGender>(PlayerGender.UNSPECIFIED);
  const [rating, setRating] = useState("1000");
  const [level, setLevel] = useState<MixedSide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<ClubPageMember | null>(null);
  const [existing, setExisting] = useState<ClubPageMember[]>([]);
  const lock = useRef(false);

  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try { await operation(); }
    catch (failure) {
      if (failure instanceof AdminSaveOutcomeUnknownError) setUncertain(true);
      setError(failure instanceof Error ? failure.message : "Unable to add player.");
    } finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  async function findExisting() {
    if (!clubId) return [];
    const roster = await adminApi<ClubPageMember[]>(`/api/clubs/${encodeURIComponent(clubId)}/members`);
    const matches = roster.filter(member => normalizeNameLookupKey(member.name) === normalizeNameLookupKey(name));
    setExisting(matches);
    return matches;
  }
  async function selectMember(member: ClubPageMember) {
    setSaved(member);
    await onSaved(member, clubId);
  }
  function submit() {
    if (uncertain) return;
    void run(async () => {
      if (saved) return onSaved(saved, clubId);
      if (clubs.length && !club) throw new Error("Choose a club.");
      const clean = name.trim();
      if (clean.length < 2 || clean.length > 100 || !normalizeNameLookupKey(clean)) throw new Error("Enter a player name from 2 to 100 characters.");
      if (gender === PlayerGender.UNSPECIFIED) throw new Error("Choose the player’s gender.");
      const initialRating = Number(rating);
      if (!rating.trim() || !Number.isInteger(initialRating) || initialRating < 0 || initialRating > 5000) throw new Error("Enter a whole-number rating from 0 to 5000.");
      if ((await findExisting()).length) throw new Error("This name is already in the club. Select the existing player below.");
      if (saving) {
        let member: ClubPageMember;
        try {
          member = await adminApi<ClubPageMember>(`/api/clubs/${encodeURIComponent(clubId)}/members`, "POST", {
            name: clean, gender, initialRating, status: "CORE", mixedSideOverride: mixed ? level : null,
          });
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 409) await findExisting();
          throw failure;
        }
        // Retain the committed identity even if admitting it to the session fails.
        await selectMember(member);
      } else if (onGuest) {
        await onGuest({ name: clean, gender, initialElo: initialRating, mixedSideOverride: mixed ? level : null, ...(clubId ? { representingClubId: clubId } : {}) });
      } else throw new Error("Saving players to this club requires an admin.");
    });
  }
  function recover() {
    void run(async () => {
      if (saved) {
        // The admission callback checks current session membership before retrying.
        await onSaved(saved, clubId);
      } else if (!saving && onCheckGuest && await onCheckGuest(name.trim(), clubId)) {
        return;
      } else {
        const matches = await findExisting();
        if (matches.length) setError("Select the existing player below to continue.");
      }
      setUncertain(false);
    });
  }
  return <form className="new-player-form" onSubmit={event => { event.preventDefault(); submit(); }}>
    <h3>Add new player</h3>
    <fieldset disabled={busy || !!saved || uncertain}>
      {clubs.length > 1 && <label className="field-label">Club<select value={clubId} onChange={event => { setClubId(event.target.value); setExisting([]); setSaveToClub(!!clubs.find(item => item.id === event.target.value)?.canSave); }}><option value="">Choose club</option>{clubs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {onGuest && <div className="new-player-scope" role="group" aria-label="Save player">
        <button type="button" aria-pressed={saving} disabled={!club?.canSave} onClick={() => setSaveToClub(true)}>Save to club</button>
        <button type="button" aria-pressed={!saving} onClick={() => setSaveToClub(false)}>This session only</button>
      </div>}
      <p className="muted">{saving ? "Available for future sessions. No account needed." : "Add as a guest for this session."}</p>
      {club && !club.canSave && <p className="muted">Saving to the club requires an admin.</p>}
      <label className="field-label">Name<input autoFocus value={name} maxLength={100} onChange={event => { setName(event.target.value); setExisting([]); }} required /></label>
      <label className="field-label">Gender<select value={gender} onChange={event => { setGender(event.target.value as PlayerGender); setLevel(null); }} required><option value={PlayerGender.UNSPECIFIED}>Choose gender</option><option value={PlayerGender.MALE}>Male</option><option value={PlayerGender.FEMALE}>Female</option></select></label>
      <details className="pairing-options"><summary>Additional options</summary><label className="field-label">Starting rating<input type="number" inputMode="numeric" min={0} max={5000} step={1} value={rating} onChange={event => setRating(event.target.value)} /></label></details>
      {mixed && <MixedPairingControl gender={gender} value={level} onChange={setLevel} />}
    </fieldset>
    {saved && <p role="status">{saved.name} is saved to the club. Add them to the session to continue.</p>}
    <ErrorText error={error} />
    {!saved && existing.map(member => <button type="button" className="secondary full" key={member.id} disabled={busy || uncertain} onClick={() => void run(() => selectMember(member))}>Select {member.name} · {member.elo}</button>)}
    <div className="new-player-actions">
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      {uncertain ? <button type="button" className="primary" disabled={busy} onClick={recover}>Refresh to check</button> : <button className="primary" type="submit" disabled={busy || (!saved && gender === PlayerGender.UNSPECIFIED)}>{busy ? "Adding…" : saved ? "Retry adding to session" : saving ? mode === "setup" ? "Save & select" : mode === "club" ? "Save to club" : "Save & add to session" : "Add to session"}</button>}
    </div>
  </form>;
}
