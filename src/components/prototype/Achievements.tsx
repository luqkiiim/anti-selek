"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowsOutLineVertical,
  Broom,
  CalendarBlank,
  CaretRight,
  ChartLineUp,
  Check,
  Handshake,
  HourglassLow,
  Medal,
  Megaphone,
  PencilSimple,
  Shuffle,
  Sparkle,
  Trophy,
  UsersThree,
  Volleyball,
  Waveform,
} from "@phosphor-icons/react";
import type {
  AchievementCollection,
  AchievementId,
  AchievementTier,
  ClubAchievement,
} from "@/lib/clubAchievements";
import { Sheet } from "./Primitives";
import "./achievements.css";

type UnseenAchievement = AchievementCollection["unseen"];

const tierNames = ["Bronze", "Silver", "Gold"];
const tierColors = ["bronze", "silver", "gold"];

function AchievementPictogram({ id, size }: { id: AchievementId; size: number }) {
  const props = { className: "achievement-badge-pictogram", size, weight: "duotone" as const };
  switch (id) {
    case "first-serve": return <Volleyball {...props} />;
    case "familiar-face": return <UsersThree {...props} />;
    case "mix-it-up": return <Shuffle {...props} />;
    case "rhythm": return <Waveform {...props} />;
    case "on-the-board": return <ChartLineUp {...props} />;
    case "down-to-wire": return <HourglassLow {...props} />;
    case "clean-sweep": return <Broom {...props} />;
    case "back-in-business": return <ArrowCounterClockwise {...props} />;
    case "raising-bar": return <ArrowsOutLineVertical {...props} />;
    case "good-together": return <Handshake {...props} />;
    case "making-it-happen": return <Megaphone {...props} />;
  }
}

function earnedTier(achievement: ClubAchievement) {
  return Math.max(0, Math.min(achievement.tiers.length, achievement.earnedTier));
}

function nextTier(achievement: ClubAchievement) {
  return achievement.tiers.find((tier) => tier.tier > earnedTier(achievement)) || null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function tierName(tier: number, achievement?: ClubAchievement) {
  if (achievement?.tiers.length === 1) return "Milestone";
  return tierNames[tier - 1] || `Tier ${tier}`;
}

function targetCopy(tier: AchievementTier, achievement: ClubAchievement) {
  return `${tier.target} ${tier.target === 1 ? achievement.unit.replace(/s$/, "") : achievement.unit}`;
}

function BadgeIcon({ achievement, tier = 0, size = "regular" }: {
  achievement: ClubAchievement;
  tier?: number;
  size?: "regular" | "large";
}) {
  const color = tier > 0
    ? tierColors[Math.max(0, Math.min(tier - 1, tierColors.length - 1))] || "locked"
    : "locked";
  return (
    <span
      className={`achievement-badge-icon achievement-badge-icon--${color} achievement-badge-icon--${size}`}
      aria-hidden="true"
    >
      <Medal className="achievement-badge-medal" size={size === "large" ? 84 : 58} weight="duotone" />
      <AchievementPictogram id={achievement.id} size={size === "large" ? 30 : 23} />
    </span>
  );
}

function progressPercent(achievement: ClubAchievement, tier: AchievementTier | null) {
  if (!tier || tier.target <= 0) return 0;
  return Math.max(0, Math.min(100, (achievement.progress / tier.target) * 100));
}

function achievementLabel(achievement: ClubAchievement) {
  const current = earnedTier(achievement);
  return current ? `${achievement.name}, ${tierName(current, achievement)} badge` : `${achievement.name}, locked badge`;
}

function AchievementDetails({
  achievement,
  onBack,
  onOpenSession,
}: {
  achievement: ClubAchievement;
  onBack: () => void;
  onOpenSession?: (code: string) => void;
}) {
  const currentTier = earnedTier(achievement);
  const next = nextTier(achievement);
  return (
    <>
      <button className="achievement-sheet-back" onClick={onBack}>
        <ArrowLeft size={18} weight="bold" aria-hidden="true" />
        All achievements
      </button>
      <div className="achievement-detail-heading">
        <BadgeIcon achievement={achievement} tier={currentTier} size="large" />
        <div>
          <span className="achievement-eyebrow">{currentTier ? `${tierName(currentTier, achievement)} earned` : "Club achievement"}</span>
          <h3>{achievement.name}</h3>
        </div>
      </div>
      <div className="achievement-progress-block">
        <div className="achievement-progress-heading">
          <strong>{achievement.progressLabel}</strong>
          {next ? <span>Next: {targetCopy(next, achievement)}</span> : <span>All tiers complete</span>}
        </div>
        {next && (
          <div className="achievement-progress-track" aria-label={`${achievement.progressLabel} toward ${targetCopy(next, achievement)}`}>
            <span style={{ width: `${progressPercent(achievement, next)}%` }} />
          </div>
        )}
      </div>
      <section className="achievement-rules" aria-labelledby={`rules-${achievement.id}`}>
        <h4 id={`rules-${achievement.id}`}>Badge rules</h4>
        <p>{achievement.description}</p>
        <ol>
          {achievement.tiers.map((tier) => {
            const earned = tier.tier <= currentTier;
            return (
              <li className={`achievement-tier-row ${earned ? "is-earned" : ""}`} key={tier.tier}>
                <span className={`achievement-tier-dot achievement-tier-dot--${tierColors[tier.tier - 1] || "locked"}`} aria-hidden="true">
                  {earned ? <Check size={13} weight="bold" /> : tier.tier}
                </span>
                <span className="achievement-tier-copy">
                  <strong>{tierName(tier.tier, achievement)} · {targetCopy(tier, achievement)}</strong>
                  {tier.earnedAt ? (
                    <small>
                      Earned {formatDate(tier.earnedAt)}
                      {tier.sessionCode && onOpenSession ? (
                        <button className="achievement-inline-link" onClick={() => onOpenSession(tier.sessionCode!)}>
                          <CalendarBlank size={14} aria-hidden="true" />
                          {tier.sessionName || "View session"}
                        </button>
                      ) : tier.sessionName ? <span> · {tier.sessionName}</span> : null}
                    </small>
                  ) : <small>Keep playing to unlock this tier</small>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function CollectionList({
  achievements,
  selected,
  onSelect,
  onOpen,
}: {
  achievements: ClubAchievement[];
  selected?: AchievementId[];
  onSelect?: (id: AchievementId) => void;
  onOpen: (achievement: ClubAchievement) => void;
}) {
  if (!achievements.length) {
    return (
      <div className="achievement-empty">
        <Trophy size={30} weight="duotone" aria-hidden="true" />
        <strong>Achievements start with your first session</strong>
        <p>Play together and club milestones will collect here.</p>
      </div>
    );
  }
  const allLocked = achievements.every((achievement) => earnedTier(achievement) === 0);
  return (
    <>
      {allLocked && <p className="achievement-list-note">Every badge is ready to earn. Your first serve is the place to start.</p>}
      <ul className="achievement-collection-list">
        {achievements.map((achievement) => {
          const current = earnedTier(achievement);
          const isSelected = selected?.includes(achievement.id) || false;
          const canSelect = !!onSelect && current > 0;
          return (
            <li key={achievement.id} className={`achievement-collection-row ${current ? "is-earned" : "is-locked"}`}>
              {onSelect ? (
                <button
                  className={`achievement-select-button ${isSelected ? "is-selected" : ""}`}
                  disabled={!canSelect}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? "Remove" : "Add"} ${achievement.name} ${isSelected ? "from" : "to"} showcase`}
                  onClick={() => onSelect(achievement.id)}
                >
                  <BadgeIcon achievement={achievement} tier={current} />
                  <span className="achievement-row-copy">
                    <strong>{achievement.name}</strong>
                    <small>{current ? `${tierName(current, achievement)} · ${achievement.progressLabel}` : "Locked · play to unlock"}</small>
                  </span>
                  {isSelected && <Check className="achievement-selected-check" size={18} weight="bold" aria-hidden="true" />}
                </button>
              ) : (
                <button className="achievement-open-button" onClick={() => onOpen(achievement)} aria-label={`View ${achievementLabel(achievement)}`}>
                  <BadgeIcon achievement={achievement} tier={current} />
                  <span className="achievement-row-copy">
                    <strong>{achievement.name}</strong>
                    <small>{current ? `${tierName(current, achievement)} · ${achievement.progressLabel}` : "Locked · play to unlock"}</small>
                  </span>
                  <CaretRight size={18} aria-hidden="true" />
                </button>
              )}
              {onSelect && <button className="achievement-row-details" onClick={() => onOpen(achievement)} aria-label={`View details for ${achievement.name}`}><CaretRight size={18} aria-hidden="true" /></button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function NextMilestone({ collection, onOpen }: {
  collection: AchievementCollection;
  onOpen: (id: AchievementId) => void;
}) {
  const milestone = useMemo(() => {
    const achievements = collection.achievements.filter((achievement) => !achievement.optional);
    if (!achievements.length) return null;
    const firstServe = achievements.find((achievement) => achievement.id === "first-serve");
    if (firstServe && firstServe.progress === 0 && earnedTier(firstServe) === 0) return { achievement: firstServe, tier: nextTier(firstServe) };
    const choices = achievements
      .map((achievement) => ({ achievement, tier: nextTier(achievement) }))
      .filter((choice): choice is { achievement: ClubAchievement; tier: AchievementTier } => !!choice.tier)
      .sort((a, b) => {
        const aProgress = a.achievement.progress / a.tier.target;
        const bProgress = b.achievement.progress / b.tier.target;
        return bProgress - aProgress || a.tier.target - b.tier.target;
      })[0];
    return choices || null;
  }, [collection.achievements]);

  if (!milestone) {
    return (
      <section className="next-milestone next-milestone--complete" aria-label="Next milestone">
        <div className="section-heading"><h3>Next milestone</h3><Sparkle size={20} weight="duotone" aria-hidden="true" /></div>
        <p>Every available club achievement is complete. Keep playing to make the next one count.</p>
      </section>
    );
  }
  const { achievement, tier } = milestone;
  if (!tier) return null;
  return (
    <section className="next-milestone" aria-label="Next milestone">
      <div className="section-heading"><h3>Next milestone</h3><span className="achievement-eyebrow">{tierName(tier.tier, achievement)} target</span></div>
      <button className="next-milestone-card" onClick={() => onOpen(achievement.id)} aria-label={`View ${achievement.name}, ${tierName(tier.tier, achievement)} target`}>
        <BadgeIcon achievement={achievement} tier={tier.tier} />
        <span className="next-milestone-copy">
          <strong>{achievement.name}</strong>
          <span className="next-milestone-progress"><span style={{ width: `${progressPercent(achievement, tier)}%` }} /><b>{achievement.progressLabel}</b><em>{targetCopy(tier, achievement)}</em></span>
        </span>
        <CaretRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

export type AchievementCabinetProps = {
  collection: AchievementCollection;
  onSaveShowcase: (ids: AchievementId[]) => Promise<void> | void;
  onOpenSession: (code: string) => void;
  onSeen: (unseen: UnseenAchievement) => Promise<void> | void;
  openRequest?: { id: AchievementId; nonce: number };
};

function fillShowcase(collection: Pick<AchievementCollection, "showcase" | "achievements">) {
  const valid = new Set(collection.achievements.map((achievement) => achievement.id));
  const selected = collection.showcase.filter((id) => valid.has(id));
  return selected.slice(0, 3);
}

export function AchievementCabinet({ collection, onSaveShowcase, onOpenSession, onSeen, openRequest }: AchievementCabinetProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"browse" | "edit">("browse");
  const [detail, setDetail] = useState<ClubAchievement | null>(null);
  const [showcase, setShowcase] = useState<AchievementId[]>(() => fillShowcase(collection));
  const [draft, setDraft] = useState<AchievementId[]>(() => fillShowcase(collection));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [celebrationBusy, setCelebrationBusy] = useState(false);
  const [celebrationError, setCelebrationError] = useState("");
  const unseen = collection.unseen || [];
  const unseenKey = unseen.map((item) => `${item.id}:${item.tier}`).join("|");
  const unseenLength = unseen.length;
  const reveals = unseen.filter(item => !unseen.some(other => other.id === item.id && other.tier > item.tier));
  const nextShowcase = useMemo(
    () => fillShowcase({ showcase: collection.showcase, achievements: collection.achievements }),
    [collection.showcase, collection.achievements],
  );

  useEffect(() => {
    if (unseenLength) setCelebrationOpen(true);
  }, [unseenKey, unseenLength]);

  useEffect(() => {
    setShowcase(nextShowcase);
    setDraft(nextShowcase);
  }, [nextShowcase]);

  const handledRequest = useRef<number | undefined>(undefined);
  const requestedId = openRequest?.id;
  const requestedNonce = openRequest?.nonce;
  useEffect(() => {
    if (!requestedId || requestedNonce === undefined || handledRequest.current === requestedNonce) return;
    const requested = collection.achievements.find((achievement) => achievement.id === requestedId);
    if (!requested) return;
    handledRequest.current = requestedNonce;
    setMode("browse");
    setDetail(requested);
    setOpen(true);
  }, [requestedId, requestedNonce, collection.achievements]);

  const selectedAchievements = showcase.map((id) => collection.achievements.find((achievement) => achievement.id === id)).filter((achievement): achievement is ClubAchievement => !!achievement);
  const openBrowse = () => {
    setDetail(null);
    setMode("browse");
    setOpen(true);
  };
  const openEdit = () => {
    setDetail(null);
    setMode("edit");
    setDraft([...showcase]);
    setSaveError("");
    setOpen(true);
  };
  const selectAchievement = (id: AchievementId) => {
    setDraft((current) => current.includes(id) ? current.filter((selected) => selected !== id) : current.length < 3 ? [...current, id] : current);
  };
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const nextShowcase = draft.slice(0, 3);
      await onSaveShowcase(nextShowcase);
      setShowcase(nextShowcase);
      setOpen(false);
    } catch {
      setSaveError("We couldn’t save your showcase yet. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const acknowledgeUnseen = async () => {
    if (!unseen.length || celebrationBusy) return;
    setCelebrationBusy(true);
    setCelebrationError("");
    try {
      await onSeen(unseen);
      setCelebrationOpen(false);
    } catch {
      setCelebrationError("We couldn’t save that yet. Try again.");
    } finally {
      setCelebrationBusy(false);
    }
  };

  return (
    <>
      <section className="achievement-cabinet" aria-label="Achievement cabinet">
          <div className="section-heading">
            <div><h3>Achievement cabinet</h3><small>{collection.achievements.filter((achievement) => earnedTier(achievement) > 0).length} of {collection.achievements.length} badges earned</small></div>
          <button className="text-button achievement-edit-button" onClick={openEdit}><PencilSimple size={16} aria-hidden="true" /> Edit</button>
        </div>
        {selectedAchievements.length ? (
          <div className="achievement-showcase" aria-label="Showcase badges">
            {selectedAchievements.map((achievement) => <button className="achievement-showcase-card" key={achievement.id} onClick={() => { setDetail(achievement); setOpen(true); }} aria-label={`View ${achievementLabel(achievement)}`}>
              <BadgeIcon achievement={achievement} tier={earnedTier(achievement)} />
              <strong>{achievement.name}</strong>
              <small>{tierName(earnedTier(achievement), achievement)}</small>
            </button>)}
            {Array.from({ length: Math.max(0, 3 - selectedAchievements.length) }, (_, index) => <span className="achievement-showcase-slot" key={`empty-${index}`} aria-label="Empty showcase slot"><Medal size={28} weight="duotone" aria-hidden="true" /><small>Open slot</small></span>)}
          </div>
        ) : <div className="achievement-showcase-empty"><Medal size={29} weight="duotone" aria-hidden="true" /><p>Choose up to three earned badges to show on your club profile.</p><button className="secondary" onClick={openEdit}>Choose badges</button></div>}
        <button className="achievement-view-all" onClick={openBrowse}>View full collection <CaretRight size={17} aria-hidden="true" /></button>
      </section>

      {typeof document !== "undefined" && createPortal(<>
      <Sheet open={open} title={detail ? detail.name : mode === "edit" ? "Edit showcase" : "Achievement collection"} onClose={() => { setOpen(false); setDetail(null); }} busy={saving}>
        {detail ? <AchievementDetails achievement={detail} onBack={() => setDetail(null)} onOpenSession={onOpenSession} /> : <>
          {mode === "edit" ? <>
            <div className="achievement-sheet-intro"><p>Pick three earned badges for your club profile.</p><span>{draft.length} / 3 selected</span></div>
            <CollectionList achievements={collection.achievements} selected={draft} onSelect={selectAchievement} onOpen={setDetail} />
            {saveError && <p className="achievement-error" role="alert">{saveError}</p>}
            <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save showcase"}</button>
          </> : <>
            <div className="achievement-sheet-intro"><p>Explore every club badge and its exact tier rules.</p><span>{selectedAchievements.length} showcased</span></div>
            <CollectionList achievements={collection.achievements} onOpen={setDetail} />
          </>}
        </>}
      </Sheet>

      <Sheet open={celebrationOpen && unseen.length > 0} title="New club achievement" onClose={() => void acknowledgeUnseen()} busy={celebrationBusy}>
        <div className="achievement-celebration">
          <Sparkle size={30} weight="duotone" aria-hidden="true" />
          <h3>{reveals.length === 1 ? "A new badge is yours" : `${reveals.length} new badges are yours`}</h3>
          <p>Your time on court earned this. Keep the momentum going.</p>
          <div className="achievement-celebration-list">
            {reveals.map((item) => {
              const achievement = collection.achievements.find((candidate) => candidate.id === item.id);
              return achievement ? <div className="achievement-celebration-row" key={`${item.id}:${item.tier}`}><BadgeIcon achievement={achievement} tier={item.tier} /><span><strong>{achievement.name}</strong><small>{tierName(item.tier, achievement)} badge</small></span></div> : null;
            })}
          </div>
          {celebrationError && <p className="achievement-error" role="alert">{celebrationError}</p>}
          <button className="primary" onClick={() => void acknowledgeUnseen()}>{celebrationBusy ? "Saving…" : "Got it"}</button>
        </div>
      </Sheet>
      </>, document.body)}
    </>
  );
}
