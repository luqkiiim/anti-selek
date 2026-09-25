"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  DotsThreeVertical,
  MagnifyingGlass,
  Plus,
  Trash,
  UserPlus,
} from "@phosphor-icons/react";
import {
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionMode,
  SessionPool,
  MixedSide,
} from "@/types/enums";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import type { Player, SessionData } from "@/components/session/sessionTypes";
import { api } from "./api";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import "./live-player-management.css";

interface SessionRosterMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
  preferredPool: SessionPool;
  gender: PlayerGender;
  representingClubId?: string | null;
  representingClubName?: string | null;
  elo: number;
}

type ListScreen = "players" | "roster";
type PlayerOptionsScreen = "preferences" | "rename" | "remove";

export interface LivePlayerManagementProps {
  code: string;
  session: SessionData;
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown> | unknown;
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function fieldClass() {
  return "pm-field";
}

export function LivePlayerManagement({
  code,
  session,
  open,
  onClose,
  onChanged,
}: LivePlayerManagementProps) {
  const [listScreen, setListScreen] = useState<ListScreen>("players");
  const [optionsScreen, setOptionsScreen] = useState<PlayerOptionsScreen | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState<SessionRosterMember[]>([]);
  const [poolByRosterEntry, setPoolByRosterEntry] = useState<Record<string, SessionPool>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRating, setGuestRating] = useState("1000");
  const [guestGender, setGuestGender] = useState<PlayerGender>(PlayerGender.UNSPECIFIED);
  const [guestMixedSideOverride, setGuestMixedSideOverride] = useState<MixedSide | null>(null);
  const [guestRepresentingClubId, setGuestRepresentingClubId] = useState("");

  const canManage = Boolean(session.viewerCanManage && !session.viewerIsQuickAccess);
  const isMixicano = session.mode === SessionMode.MIXICANO;
  const isInterclub = session.collabFormat === SessionCollabFormat.INTERCLUB;
  const hasAcceptedCollabRoster = new Set(
    (session.clubs ?? [])
      .filter((club) => club.status === "ACCEPTED")
      .map((club) => club.id),
  ).size > 1;
  const selectedPlayer = session.players.find((player) => player.userId === selectedPlayerId) ?? null;
  const alreadyInSession = useMemo(
    () => new Set(session.players.map((player) => player.userId)),
    [session.players],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visiblePlayers = useMemo(
    () => session.players
      .slice()
      .sort((left, right) => left.user.name.localeCompare(right.user.name))
      .filter((player) => player.user.name.toLocaleLowerCase().includes(normalizedSearch)),
    [normalizedSearch, session.players],
  );
  const pausedCount = session.players.filter((player) => player.isPaused).length;
  const visibleRoster = useMemo(
    () => roster.filter((member) =>
      !alreadyInSession.has(member.id) &&
      `${member.name} ${member.representingClubName}`.toLocaleLowerCase().includes(normalizedSearch),
    ),
    [alreadyInSession, normalizedSearch, roster],
  );

  useEffect(() => {
    if (open) {
      setListScreen("players");
      setOptionsScreen(null);
      setSelectedPlayerId(null);
      setSearch("");
      setError("");
      setRosterError("");
      setAddingGuest(false);
    }
  }, [code, open]);

  async function runAction(
    operation: () => Promise<unknown>,
    afterChange?: () => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      await onChanged();
      afterChange?.();
    } catch (caught) {
      setError(messageFor(caught, "Unable to save this change."));
    } finally {
      setBusy(false);
    }
  }

  async function openRoster(searchValue = ""): Promise<SessionRosterMember[] | null> {
    setListScreen("roster");
    setSearch(searchValue);
    setRosterError("");
    setError("");
    setLoadingRoster(true);
    try {
      const rosterUrl = hasAcceptedCollabRoster
        ? `/api/sessions/${code}/roster`
        : session.clubId
          ? `/api/clubs/${session.clubId}/members`
          : null;
      if (!rosterUrl) throw new Error("This session has no club roster to add from.");
      const response = await api<unknown>(rosterUrl);
      if (!Array.isArray(response)) {
        throw new Error("Club member roster returned an invalid response.");
      }
      const members = response as SessionRosterMember[];
      setRoster(members);
      setPoolByRosterEntry((current) => {
        const next = { ...current };
        for (const member of members) {
          const key = rosterEntryKey(member);
          next[key] ??= member.preferredPool;
        }
        return next;
      });
      return members;
    } catch (caught) {
      setRosterError(messageFor(caught, "Unable to load club members."));
      setRoster([]);
      return null;
    } finally {
      setLoadingRoster(false);
    }
  }

  function openGuestForm(prefill = "") {
    setGuestName(prefill);
    setGuestRating("1000");
    setGuestGender(PlayerGender.UNSPECIFIED);
    setGuestMixedSideOverride(null);
    setGuestRepresentingClubId("");
    setError("");
    setAddingGuest(true);
  }

  function addGuest() {
    const name = guestName.trim();
    const rating = Number(guestRating);
    if (name.length < 2) return setError("Guest name must be at least 2 characters.");
    if (session.players.some((player) => player.user.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) || roster.some((member) => member.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return setError("That name is already in the session or club roster.");
    }
    if (![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGender)) return setError("Choose Male or Female for this guest.");
    if (!guestRating.trim() || !Number.isInteger(rating) || rating < 0 || rating > 5000) return setError("Enter a whole-number rating from 0 to 5000.");
    const representingClubId = isInterclub ? guestRepresentingClubId : undefined;
    if (isInterclub && !(session.clubs ?? []).some((club) => club.status === "ACCEPTED" && club.id === representingClubId)) return setError("Choose a club before adding an interclub guest.");
    return runAction(
      () => api(`/api/sessions/${code}/guests`, "POST", {
        name,
        initialElo: rating,
        gender: guestGender,
        mixedSideOverride: guestMixedSideOverride,
        pool: SessionPool.A,
        ...(representingClubId ? { representingClubId } : {}),
      }),
      () => {
        setAddingGuest(false);
        setListScreen("players");
      },
    );
  }

  function openPreferences(player: Player) {
    setSelectedPlayerId(player.userId);
    setError("");
    setOptionsScreen("preferences");
  }

  function rosterEntryKey(member: SessionRosterMember) {
    return `${member.id}:${member.representingClubId ?? ""}`;
  }

  function addMember(member: SessionRosterMember) {
    const pool = poolByRosterEntry[rosterEntryKey(member)] ?? member.preferredPool;
    return runAction(
      () => api(`/api/sessions/${code}/join`, "POST", {
        userId: member.id,
        pool: session.poolsEnabled ? pool : SessionPool.A,
        ...(isInterclub && member.representingClubId
          ? { representingClubId: member.representingClubId }
          : {}),
      }),
      () => setListScreen("players"),
    );
  }

  function toggleSkipNext(player: Player) {
    if ((!player.skipNextMatchAt && player.isPaused) || !canManage) return;
    return runAction(() => api(
      `/api/sessions/${code}/players/${player.userId}/skip-next`,
      "PATCH",
      { skipNextMatch: !player.skipNextMatchAt },
    ));
  }

  function updatePreference(player: Player, patch: Record<string, unknown>) {
    return runAction(() => api(
      `/api/sessions/${code}/players/${player.userId}/preferences`,
      "PATCH",
      patch,
    ));
  }

  function startRename(player: Player) {
    setSelectedPlayerId(player.userId);
    setRename(player.user.name);
    setError("");
    setOptionsScreen("rename");
  }

  function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = rename.trim();
    if (!selectedPlayer || name.length < 2) {
      setError("Guest name must be at least 2 characters.");
      return;
    }
    return runAction(
      () => api(`/api/sessions/${code}/players/${selectedPlayer.userId}`, "PATCH", { name }),
      () => setOptionsScreen("preferences"),
    );
  }

  function removePlayer() {
    if (!selectedPlayer) return;
    return runAction(
      () => api(`/api/sessions/${code}/players/${selectedPlayer.userId}`, "DELETE"),
      () => {
        setSelectedPlayerId(null);
        setOptionsScreen(null);
        setListScreen("players");
      },
    );
  }

  const title = listScreen === "players" ? "Players" : "Add club members";
  const optionsTitle = optionsScreen === "preferences"
    ? selectedPlayer?.user.name ?? "Player settings"
    : optionsScreen === "rename"
      ? "Rename guest"
      : "Remove player";

  if (!open) return null;

  return (
    <Sheet title={title} onClose={onClose} open={open} busy={busy}>
      <div className="live-player-management">
        {listScreen === "roster" ? (
          <button
            type="button"
            className="pm-back"
            disabled={busy}
            onClick={() => {
              setError("");
              setListScreen("players");
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Players
          </button>
        ) : null}

        <ErrorText error={optionsScreen ? "" : error} />

        {listScreen === "players" ? (
          <>
            <div className="pm-summary">
              <strong>{session.players.length} player{session.players.length === 1 ? "" : "s"}</strong>
              {pausedCount > 0 ? <span>{pausedCount} taking a break</span> : null}
            </div>
            {canManage && session.clubId ? (
              <button type="button" className="pm-primary" onClick={() => void openRoster()} disabled={busy}>
                <UserPlus size={19} aria-hidden="true" />
                Add club members
              </button>
            ) : null}
            {session.players.length > 5 ? (
              <label className="pm-search">
                <MagnifyingGlass size={18} aria-hidden="true" />
                <span className="sr-only">Search session players</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a player"
                  aria-label="Search session players"
                />
              </label>
            ) : null}
            {visiblePlayers.length ? (
              <div className="pm-player-list">
                {visiblePlayers.map((player) => (
                  <article className="pm-player-card" key={player.userId}>
                    <div className="pm-player-heading">
                      <Avatar name={player.user.name} url={player.user.avatarUrl} />
                      <div className="pm-player-copy">
                        <strong>{player.user.name}</strong>
                        <small>
                          {player.isPaused ? "Paused · " : ""}Rating {player.user.elo}
                          {player.isGuest ? " · Guest" : ""}
                          {session.poolsEnabled ? ` · ${player.pool === SessionPool.A ? session.poolAName || "Competitive" : session.poolBName || "Social"}` : ""}
                        </small>
                        {player.skipNextMatchAt ? <small className="pm-skip-state">Skipping next</small> : null}
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className="pm-icon-action"
                          aria-label={`Options for ${player.user.name}`}
                          disabled={busy}
                          onClick={() => openPreferences(player)}
                        >
                          <DotsThreeVertical size={20} weight="bold" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="pm-empty">
                <p>No players match this search.</p>
                {canManage && search.trim().length >= 2 ? (
                  <button type="button" className="pm-secondary" disabled={busy} onClick={() => {
                    const prefill = search.trim();
                    void openRoster(prefill).then((members) => {
                      if (members && !members.some((member) => member.name.trim().toLocaleLowerCase() === prefill.toLocaleLowerCase())) {
                        openGuestForm(prefill);
                      }
                    });
                  }}><Plus size={18} aria-hidden="true" />Add “{search.trim()}” as a guest</button>
                ) : null}
              </div>
            )}
          </>
        ) : null}

        {listScreen === "roster" ? (
          <>
            <label className="pm-search">
              <MagnifyingGlass size={18} aria-hidden="true" />
              <span className="sr-only">Search club members</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a club member"
                aria-label="Search club members"
              />
            </label>
            {rosterError ? <ErrorText error={rosterError} /> : null}
            {loadingRoster ? <p className="pm-empty" role="status">Loading club members…</p> : null}
            {!loadingRoster && !rosterError && visibleRoster.length === 0 ? (
              <div className="pm-empty">
                <p>{normalizedSearch ? "No club members match this search." : "Everyone in this roster is already here."}</p>
                {!addingGuest && canManage && normalizedSearch.length >= 2 &&
                  !session.players.some((player) => player.user.name.trim().toLocaleLowerCase() === normalizedSearch) &&
                  !roster.some((member) => member.name.trim().toLocaleLowerCase() === normalizedSearch) ? (
                    <button type="button" className="pm-secondary" disabled={busy} onClick={() => openGuestForm(search.trim())}>
                      <Plus size={18} aria-hidden="true" /> Add “{search.trim()}” as a guest
                    </button>
                  ) : null}
              </div>
            ) : null}
            <div className="pm-player-list">
              {visibleRoster.map((member) => {
                const key = rosterEntryKey(member);
                return (
                  <article className="pm-player-card" key={key}>
                    <div className="pm-player-heading">
                      <Avatar name={member.name} url={member.avatarUrl} />
                      <div className="pm-player-copy">
                        <strong>{member.name}</strong>
                        <small>{member.representingClubName ? `${member.representingClubName} · ` : ""}Rating {member.elo}</small>
                      </div>
                    </div>
                    <div className="pm-roster-actions">
                      {session.poolsEnabled ? (
                        <label className="pm-pool-choice">
                          <span className="sr-only">Group for {member.name}</span>
                          <select
                            value={poolByRosterEntry[key] ?? member.preferredPool}
                            onChange={(event) => setPoolByRosterEntry((current) => ({
                              ...current,
                              [key]: event.target.value as SessionPool,
                            }))}
                            disabled={busy}
                          >
                            <option value={SessionPool.A}>{session.poolAName || "Competitive"}</option>
                            <option value={SessionPool.B}>{session.poolBName || "Social"}</option>
                          </select>
                        </label>
                      ) : null}
                      <button type="button" className="pm-secondary" disabled={busy} onClick={() => void addMember(member)}>
                        Add to session
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {addingGuest ? (
              <form className="pm-form" onSubmit={(event) => { event.preventDefault(); void addGuest(); }}>
                <h3>Add a guest</h3>
                <label className="pm-label"><span>Guest name</span><input className={fieldClass()} value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label>
                <label className="pm-label"><span>Starting rating</span><input className={fieldClass()} type="number" min={0} max={5000} step={1} value={guestRating} onChange={(event) => setGuestRating(event.target.value)} /></label>
                <label className="pm-label"><span>Gender</span><select className={fieldClass()} value={guestGender} onChange={(event) => { setGuestGender(event.target.value as PlayerGender); setGuestMixedSideOverride(null); }}><option value={PlayerGender.UNSPECIFIED}>Choose gender</option><option value={PlayerGender.MALE}>Male</option><option value={PlayerGender.FEMALE}>Female</option></select></label>
                {guestGender !== PlayerGender.UNSPECIFIED ? (
                  <label className="pm-label"><span>Mixed doubles side</span><select className={fieldClass()} value={guestMixedSideOverride ?? ""} onChange={(event) => setGuestMixedSideOverride(event.target.value ? event.target.value as MixedSide : null)}><option value="">Default</option>{(() => { const option = getMixedSideOverrideOptionForGender(guestGender); return option ? <option value={option.value}>{option.label}</option> : null; })()}</select></label>
                ) : null}
                {isInterclub ? (
                  <label className="pm-label"><span>Represents</span><select className={fieldClass()} value={guestRepresentingClubId} onChange={(event) => setGuestRepresentingClubId(event.target.value)}><option value="">Choose club</option>{(session.clubs ?? []).filter((club) => club.status === "ACCEPTED").map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
                ) : null}
                <button type="button" className="pm-secondary" disabled={busy} onClick={() => { setAddingGuest(false); setError(""); }}>Cancel</button>
                <button type="submit" className="pm-primary" disabled={busy || guestGender === PlayerGender.UNSPECIFIED}>{busy ? "Adding…" : "Add guest"}</button>
              </form>
            ) : null}
          </>
        ) : null}

      </div>
      <Sheet
        open={open && optionsScreen !== null}
        title={optionsTitle}
        onClose={() => {
          setOptionsScreen(null);
          setSelectedPlayerId(null);
          setError("");
        }}
        busy={busy}
      >
        <div className="pm-player-options">
          <button
            type="button"
            className="pm-back"
            disabled={busy}
            onClick={() => {
              setError("");
              if (optionsScreen === "remove") {
                setOptionsScreen("preferences");
              } else {
                setOptionsScreen(null);
                setSelectedPlayerId(null);
              }
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {optionsScreen === "remove" ? "Player settings" : "Players"}
          </button>

          <ErrorText error={error} />

        {optionsScreen === "preferences" && selectedPlayer ? (
          <>
            {isMixicano && selectedPlayer.isGuest ? (
              <label className="pm-label">
                <span>Gender</span>
                <select
                  className={fieldClass()}
                  value={selectedPlayer.gender}
                  disabled={busy}
                  onChange={(event) => void updatePreference(selectedPlayer, {
                    gender: event.target.value as PlayerGender,
                    mixedSideOverride: null,
                  })}
                >
                  <option value={PlayerGender.MALE}>Male</option>
                  <option value={PlayerGender.FEMALE}>Female</option>
                </select>
              </label>
            ) : null}
            {isMixicano ? (
              <label className="pm-label">
                <span>Partner preference</span>
                <select
                  className={fieldClass()}
                  value={selectedPlayer.partnerPreference}
                  disabled={busy}
                  onChange={(event) => void updatePreference(selectedPlayer, {
                    mixedSideOverride: null,
                    partnerPreference: event.target.value as PartnerPreference,
                  })}
                >
                  <option value={PartnerPreference.OPEN}>Open</option>
                  <option value={PartnerPreference.FEMALE_FLEX}>Female flex</option>
                </select>
              </label>
            ) : null}
            {session.poolsEnabled ? (
              <label className="pm-label">
                <span>Game group</span>
                <select
                  className={fieldClass()}
                  value={selectedPlayer.pool}
                  disabled={busy}
                  onChange={(event) => void updatePreference(selectedPlayer, {
                    pool: event.target.value as SessionPool,
                  })}
                >
                  <option value={SessionPool.A}>{session.poolAName || "Competitive"}</option>
                  <option value={SessionPool.B}>{session.poolBName || "Social"}</option>
                </select>
                {selectedPlayer.pendingPool ? (
                  <small>Group changes after the current match.</small>
                ) : null}
              </label>
            ) : null}
            {isInterclub ? (
              <label className="pm-label">
                <span>Represents</span>
                <select
                  className={fieldClass()}
                  value={selectedPlayer.representingClubId ?? ""}
                  disabled={busy}
                  onChange={(event) => void updatePreference(selectedPlayer, {
                    representingClubId: event.target.value || null,
                  })}
                >
                  <option value="">Unassigned</option>
                  {(session.clubs ?? []).filter((club) => club.status === "ACCEPTED").map((club) => (
                    <option value={club.id} key={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {canManage && (!selectedPlayer.isPaused || selectedPlayer.skipNextMatchAt) ? (
              <button
                type="button"
                className="pm-secondary pm-full"
                disabled={busy}
                onClick={() => void toggleSkipNext(selectedPlayer)}
              >
                {selectedPlayer.skipNextMatchAt ? "Cancel skip" : "Skip next match"}
              </button>
            ) : null}
            {selectedPlayer.isGuest ? (
              <button type="button" className="pm-secondary pm-full" disabled={busy} onClick={() => startRename(selectedPlayer)}>
                Rename guest
              </button>
            ) : null}
            <button type="button" className="pm-danger" disabled={busy} onClick={() => setOptionsScreen("remove")}>
              <Trash size={18} aria-hidden="true" />
              Remove from session
            </button>
          </>
        ) : null}

        {optionsScreen === "rename" && selectedPlayer ? (
          <form className="pm-form" onSubmit={saveRename}>
            <label className="pm-label">
              <span>Guest name</span>
              <input className={fieldClass()} value={rename} onChange={(event) => setRename(event.target.value)} maxLength={80} autoFocus />
            </label>
            <button type="submit" className="pm-primary" disabled={busy || rename.trim().length < 2}>
              {busy ? "Saving…" : "Save name"}
            </button>
          </form>
        ) : null}

        {optionsScreen === "remove" && selectedPlayer ? (
          <div className="pm-remove-confirm">
            <p>Remove <strong>{selectedPlayer.user.name}</strong> from this session?</p>
            <p className="pm-hint">Players with match history or a current match cannot be removed.</p>
            <button type="button" className="pm-danger" disabled={busy} onClick={() => void removePlayer()}>
              {busy ? "Removing…" : "Remove player"}
            </button>
            <button type="button" className="pm-secondary pm-full" disabled={busy} onClick={() => setOptionsScreen("preferences")}>
              Keep player
            </button>
          </div>
        ) : null}
        </div>
      </Sheet>
    </Sheet>
  );
}

export default LivePlayerManagement;
