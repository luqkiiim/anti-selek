"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionData } from "@/components/session/sessionTypes";
import { sessionPollInterval, useSessionPolling } from "@/components/session/useSessionPolling";
import { api, ApiError } from "./api";
import { ErrorText } from "./Primitives";
import "./club-collaboration.css";

export type CollaborationClub = {
  id: string;
  name: string;
  role: string;
  status: string;
  rulesConfirmedRevision: number | null;
  resetConfirmedRevision: number | null;
};
export type LineupRow = {
  id: string;
  position: number;
  revision: number;
  team1Player1Id: string | null;
  team1Player2Id: string | null;
  team2Player1Id: string | null;
  team2Player2Id: string | null;
  hostConfirmedRevision: number | null;
  partnerConfirmedRevision: number | null;
  courtPreferenceId: string | null;
  cancelled: boolean;
  matchId: string | null;
};
export type Collaboration = {
  collaborationVersion: number;
  schedulingMode: string;
  scoringFormat: string;
  ratingMode: string;
  rulesRevision: number;
  resultsRevision: number;
  status: string;
  hostClubId: string;
  clubs: CollaborationClub[];
  capabilities: {
    host: boolean;
    manageClubIds: string[];
    adminClubIds: string[];
    reviewClubIds?: string[];
  };
  lineup: LineupRow[];
};
export function useClubCollaboration(code: string, enabled: boolean, status?: string, pollingEnabled = true) {
  const [state, setState] = useState<{
    code: string;
    data: Collaboration;
  } | null>(null);
  const requestVersion = useRef(0);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const next = await api<Collaboration>(
        `/api/sessions/${code}/collaboration`,
        "GET", undefined, controller.signal,
      );
      if (version === requestVersion.current) {
        setState({ code, data: next });
        setError("");
      }
    } catch (error) {
      if (version === requestVersion.current)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to refresh collaboration.",
        );
    } finally {
      clearTimeout(timeout);
    }
  }, [code, enabled]);
  const invalidate = useCallback(() => {
    requestVersion.current += 1;
  }, []);
  useEffect(() => () => invalidate(), [code, enabled, invalidate]);
  useSessionPolling(refresh, {
    enabled: enabled && pollingEnabled,
    intervalMs: sessionPollInterval(status),
    refreshOnEnable: true,
  });
  return {
    data: enabled && state?.code === code ? state.data : null,
    error,
    refresh,
  };
}

export function ClubCollaboration({
  session,
  data,
  error,
  onChanged,
  onManagePlayers,
  onReset,
}: {
  session: SessionData;
  data: Collaboration | null;
  error: string;
  onChanged: () => Promise<unknown>;
  onManagePlayers: () => void;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const [ruleDraft, setRuleDraft] = useState<{
    revision: number;
    scoringFormat: string;
    ratingMode: string;
  } | null>(null);
  const [pairDrafts, setPairDrafts] = useState<
    Record<string, { revision: number; ids: [string, string] }>
  >({});
  const [courts, setCourts] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<
    Record<
      string,
      { revision: number; position?: number; courtPreferenceId?: string }
    >
  >({});
  if (!data)
    return (
      <section className="collaboration-panel">
        <ErrorText error={error} />
        <p role="status">Loading club collaboration…</p>
      </section>
    );
  const c = data;
  const endpoint = `/api/sessions/${session.code}`;
  const clubs = c.clubs.filter((club) => club.status === "ACCEPTED");
  const host = clubs.find((club) => club.id === c.hostClubId),
    partner = clubs.find((club) => club.id !== c.hostClubId);
  const pending = c.clubs.find((club) => club.status === "PENDING");
  const mayManage = (clubId: string) =>
    c.capabilities.manageClubIds.includes(clubId);
  const mayConfirm = (clubId: string) =>
    c.capabilities.adminClubIds.includes(clubId);
  const agreed =
    clubs.length === 2 &&
    clubs.every((club) => club.rulesConfirmedRevision === c.rulesRevision);
  const resetAgreed =
    clubs.length === 2 &&
    clubs.every((club) => club.resetConfirmedRevision === c.resultsRevision);
  async function mutate(
    url: string,
    method: string,
    body?: unknown,
    clear?: () => void,
  ) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api(url, method, body);
      clear?.();
      await onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        clear?.();
        await onChanged();
        setActionError(
          `${error.message} Review the refreshed version and try again.`,
        );
      } else
        setActionError(
          error instanceof Error ? error.message : "Unable to save changes.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="collaboration-panel" aria-label="Club collaboration">
      <div className="collaboration-heading">
        <h2>
          {session.collabFormat === "INTERCLUB"
            ? "Club vs club"
            : "Play together"}
        </h2>
        <span>{c.ratingMode === "UNRATED" ? "Unrated" : "Rated"}</span>
      </div>
      <p className="collaboration-summary">
        {c.schedulingMode === "LINEUP" ? "Lineup" : "Free play"} ·{" "}
        {c.scoringFormat === "BEST_OF_THREE" ? "Best of three" : "Single game"}
      </p>
      <ErrorText error={actionError || error} />
      {pending && (
        <div className="collaboration-invitation">
          <span>Invitation pending · {pending.name}</span>
          {c.capabilities.host && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void mutate(endpoint + "/collaboration", "PATCH", {
                  action: "cancelInvitation",
                })
              }
            >
              Cancel invitation
            </button>
          )}
          {c.capabilities.reviewClubIds?.includes(pending.id) && (
            <div className="series-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void mutate(endpoint + "/collab", "PATCH", {
                    status: "ACCEPTED",
                  })
                }
              >
                Accept invitation
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void mutate(endpoint + "/collab", "PATCH", {
                    status: "REJECTED",
                  })
                }
              >
                Decline invitation
              </button>
            </div>
          )}
        </div>
      )}
      {c.clubs.filter(club => ["REJECTED", "CANCELLED", "WITHDRAWN"].includes(club.status)).map(club => (
        <p className="muted" role="status" key={club.id}>
          {club.name} · {club.status === "WITHDRAWN" ? "Withdrawn" : club.status === "CANCELLED" ? "Invitation cancelled" : "Invitation declined"}
        </p>
      ))}
      {session.status === "WAITING" && (
        <>
          <div className="collaboration-clubs">
            {clubs.map((club) => (
              <div key={club.id}>
                <strong>{club.name}</strong>
                <span>
                  {club.rulesConfirmedRevision === c.rulesRevision
                    ? "Rules confirmed"
                    : "Review rules"}
                </span>
                {mayConfirm(club.id) &&
                  club.rulesConfirmedRevision !== c.rulesRevision && (
                    <button
                      className="secondary"
                      disabled={busy || !!ruleDraft}
                      onClick={() =>
                        void mutate(endpoint + "/collaboration", "PATCH", {
                          action: "confirmRules",
                          revision: c.rulesRevision,
                          clubId: club.id,
                        })
                      }
                    >
                      Confirm rules · {club.name}
                    </button>
                  )}
                {mayConfirm(club.id) && club.id !== c.hostClubId && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(endpoint + "/collaboration", "PATCH", {
                        action: "withdraw",
                        clubId: club.id,
                      })
                    }
                  >
                    Withdraw club
                  </button>
                )}
              </div>
            ))}
          </div>
          {c.capabilities.host &&
            session.collabFormat === "INTERCLUB" &&
            (ruleDraft ? (
              <div className="collaboration-rules">
                <label>
                  Scoring
                  <select
                    value={ruleDraft.scoringFormat}
                    onChange={(e) =>
                      setRuleDraft({
                        ...ruleDraft,
                        scoringFormat: e.target.value,
                      })
                    }
                  >
                    <option value="SINGLE_GAME">Single game</option>
                    <option value="BEST_OF_THREE">Best of three</option>
                  </select>
                </label>
                <label>
                  Club ratings
                  <select
                    value={ruleDraft.ratingMode}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, ratingMode: e.target.value })
                    }
                  >
                    <option value="UNRATED">Unrated</option>
                    <option value="RATED">Rated</option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      endpoint + "/collaboration",
                      "PATCH",
                      { action: "updateRules", ...ruleDraft },
                      () => setRuleDraft(null),
                    )
                  }
                >
                  Save rules
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setRuleDraft(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  setRuleDraft({
                    revision: c.rulesRevision,
                    scoringFormat: c.scoringFormat,
                    ratingMode: c.ratingMode,
                  })
                }
              >
                Edit rules
              </button>
            ))}
          {!agreed && (
            <p className="muted" role="status">
              Both clubs confirm the rules before starting.
            </p>
          )}
        </>
      )}
      {c.capabilities.manageClubIds.length > 0 &&
        session.status !== "COMPLETED" && (
          <button className="secondary full" onClick={onManagePlayers}>
            Manage my club’s players
          </button>
        )}
      {c.schedulingMode === "LINEUP" && (
        <div className="collaboration-lineup">
          <div className="collaboration-heading">
            <h3>Lineup</h3>
            {c.capabilities.host && session.status !== "COMPLETED" && (
              <button
                className="secondary"
                disabled={busy || !partner}
                onClick={() => void mutate(endpoint + "/lineup", "POST")}
              >
                Add match
              </button>
            )}
          </div>
          {!c.lineup.filter((row) => !row.cancelled).length && (
            <p className="muted">No matches in the lineup yet.</p>
          )}
          {[...c.lineup]
            .filter((row) => !row.cancelled)
            .sort((a, b) => a.position - b.position)
            .map((row) => {
              const linked = session.courts.find(
                (court) => court.currentMatch?.id === row.matchId,
              );
              const openCourts = session.courts.filter(
                (court) => !court.currentMatch,
              );
              const courtSelection =
                courts[row.id] ?? row.courtPreferenceId ?? "";
              const courtId = courtSelection || openCourts[0]?.id || "";
              const confirmed =
                row.hostConfirmedRevision === row.revision &&
                row.partnerConfirmedRevision === row.revision;
              return (
                <article className="lineup-row" key={row.id}>
                  <div className="collaboration-heading">
                    <strong>Match {row.position}</strong>
                    <span>
                      {row.matchId
                        ? linked
                          ? "Playing"
                          : "Played"
                        : confirmed
                          ? "Confirmed"
                          : "Draft"}
                    </span>
                  </div>
                  <div className="lineup-sides">
                    {[host, partner].map((club, index) => {
                      if (!club) return null;
                      const key = row.id + club.id;
                      const saved: [string, string] =
                        index === 0
                          ? [row.team1Player1Id ?? "", row.team1Player2Id ?? ""]
                          : [
                              row.team2Player1Id ?? "",
                              row.team2Player2Id ?? "",
                            ];
                      const draft = pairDrafts[key];
                      const ids = draft?.ids ?? saved;
                      const own =
                        mayManage(club.id) &&
                        !row.matchId &&
                        session.status !== "COMPLETED";
                      const confirmed =
                        (index === 0
                          ? row.hostConfirmedRevision
                          : row.partnerConfirmedRevision) === row.revision;
                      const players = session.players.filter(
                        (player) =>
                          (player.representingClubId ??
                            player.profileClubId) === club.id,
                      );
                      return (
                        <div className="lineup-side" key={club.id}>
                          <strong>{club.name}</strong>
                          {[0, 1].map((slot) =>
                            own ? (
                              <label key={slot}>
                                <span className="sr-only">
                                  {club.name} player {slot + 1} for match{" "}
                                  {row.position}
                                </span>
                                <select
                                  aria-label={`${club.name} player ${slot + 1} for match ${row.position}`}
                                  value={ids[slot]}
                                  disabled={busy}
                                  onChange={(e) => {
                                    const next: [string, string] = [...ids];
                                    next[slot] = e.target.value;
                                    setPairDrafts((current) => ({
                                      ...current,
                                      [key]: {
                                        revision:
                                          draft?.revision ?? row.revision,
                                        ids: next,
                                      },
                                    }));
                                  }}
                                >
                                  <option value="">Choose player</option>
                                  {players
                                    .filter(
                                      (player) =>
                                        player.userId !== ids[1 - slot],
                                    )
                                    .map((player) => (
                                      <option
                                        key={player.userId}
                                        value={player.userId}
                                      >
                                        {player.user.name}
                                        {player.isPaused ? " · Paused" : ""}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ) : (
                              <span key={slot}>
                                {session.players.find(
                                  (player) => player.userId === ids[slot],
                                )?.user.name ?? "Choose player"}
                              </span>
                            ),
                          )}
                          <span className="lineup-confirmation">
                            {confirmed ? "Confirmed" : "Not confirmed"}
                          </span>
                          {own && draft && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  endpoint + "/lineup/" + row.id,
                                  "PATCH",
                                  {
                                    revision: draft.revision,
                                    action: "pair",
                                    clubId: club.id,
                                    playerIds: ids.map((id) => id || null),
                                  },
                                  () =>
                                    setPairDrafts((current) => {
                                      const next = { ...current };
                                      delete next[key];
                                      return next;
                                    }),
                                )
                              }
                            >
                              Save pair
                            </button>
                          )}
                          {!row.matchId && mayManage(club.id) && !confirmed && (
                            <button
                              className="secondary"
                              disabled={
                                busy ||
                                !!draft ||
                                [
                                  row.team1Player1Id,
                                  row.team1Player2Id,
                                  row.team2Player1Id,
                                  row.team2Player2Id,
                                ].some((id) => !id)
                              }
                              onClick={() =>
                                void mutate(
                                  endpoint + "/lineup/" + row.id,
                                  "PATCH",
                                  {
                                    revision: row.revision,
                                    action: "confirm",
                                    clubId: club.id,
                                  },
                                )
                              }
                            >
                              Confirm pair
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {c.capabilities.host &&
                    !row.matchId &&
                    session.status !== "COMPLETED" && (
                      <div className="lineup-host">
                        <label>
                          Court
                          <select
                            value={
                              courts[row.id] ?? row.courtPreferenceId ?? ""
                            }
                            onChange={(e) => {
                              setCourts((current) => ({
                                ...current,
                                [row.id]: e.target.value,
                              }));
                              setSchedule((current) => ({
                                ...current,
                                [row.id]: {
                                  ...current[row.id],
                                  revision:
                                    current[row.id]?.revision ?? row.revision,
                                  courtPreferenceId: e.target.value,
                                },
                              }));
                            }}
                          >
                            <option value="">Any court</option>
                            {session.courts.map((court) => (
                              <option key={court.id} value={court.id}>
                                {court.label || `Court ${court.courtNumber}`}
                                {court.currentMatch ? " · Busy" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Order
                          <input
                            type="number"
                            min="1"
                            value={schedule[row.id]?.position ?? row.position}
                            onChange={(e) =>
                              setSchedule((current) => ({
                                ...current,
                                [row.id]: {
                                  ...current[row.id],
                                  revision:
                                    current[row.id]?.revision ?? row.revision,
                                  position: Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        {schedule[row.id] && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                endpoint + "/lineup/" + row.id,
                                "PATCH",
                                {
                                  action: "schedule",
                                  ...schedule[row.id],
                                  ...(schedule[row.id].courtPreferenceId !==
                                  undefined
                                    ? {
                                        courtPreferenceId:
                                          schedule[row.id].courtPreferenceId ||
                                          null,
                                      }
                                    : {}),
                                },
                                () =>
                                  setSchedule((current) => {
                                    const next = { ...current };
                                    delete next[row.id];
                                    return next;
                                  }),
                              )
                            }
                          >
                            Save order / court
                          </button>
                        )}
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              endpoint + "/lineup/" + row.id,
                              "PATCH",
                              { revision: row.revision, action: "cancel" },
                            )
                          }
                        >
                          Cancel match
                        </button>
                        {session.status === "ACTIVE" && (
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !confirmed ||
                              !agreed ||
                              !courtId ||
                              !openCourts.some((court) => court.id === courtId)
                            }
                            onClick={() =>
                              void mutate(
                                endpoint + "/lineup/" + row.id + "/start",
                                "POST",
                                { revision: row.revision, courtId },
                              )
                            }
                          >
                            Start match
                          </button>
                        )}
                      </div>
                    )}
                </article>
              );
            })}
        </div>
      )}
      {session.status === "ACTIVE" &&
        c.capabilities.adminClubIds.length > 0 && (
          <details className="collaboration-reset">
            <summary>Reset session</summary>
            <p>
              Both clubs must approve removing all results and returning to
              setup.
            </p>
            {clubs.map((club) => (
              <div key={club.id}>
                <span>
                  {club.name} ·{" "}
                  {club.resetConfirmedRevision === c.resultsRevision
                    ? "Approved"
                    : "Awaiting approval"}
                </span>
                {mayConfirm(club.id) &&
                  club.resetConfirmedRevision !== c.resultsRevision && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void mutate(endpoint + "/collaboration", "PATCH", {
                          action: "confirmReset",
                          revision: c.resultsRevision,
                          clubId: club.id,
                        })
                      }
                    >
                      Approve reset · {club.name}
                    </button>
                  )}
              </div>
            ))}
            {c.capabilities.host && (
              <button
                className="secondary danger-outline"
                disabled={busy || !resetAgreed}
                onClick={onReset}
              >
                Reset session
              </button>
            )}
          </details>
        )}
    </section>
  );
}
