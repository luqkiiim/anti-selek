"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CalendarBlank, CaretRight, Medal } from "@phosphor-icons/react";
import type {
  AchievementId,
  PublicAchievement,
  PublicAchievementCollection,
} from "@/lib/clubAchievements";
import { BadgeIcon } from "./Achievements";
import { Sheet } from "./Primitives";
import "./member-pins.css";

export type { PublicAchievementCollection } from "@/lib/clubAchievements";

export type MemberPinsProps = {
  collection: PublicAchievementCollection;
  compact?: boolean;
};

function tierName(tier: number, achievement: PublicAchievement) {
  if (achievement.id === "first-serve") return "Milestone";
  return ["Bronze", "Silver", "Gold"][tier - 1] || `Tier ${tier}`;
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

function highestTier(achievement: PublicAchievement) {
  return achievement.tiers.reduce((highest, tier) => Math.max(highest, tier.tier), 0);
}

export function MemberPins({ collection, compact = false }: MemberPinsProps) {
  const [detail, setDetail] = useState<PublicAchievement | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const byId = new Map<AchievementId, PublicAchievement>(collection.earned.map((achievement) => [achievement.id, achievement]));
  const showcase = collection.showcase
    .map((id) => byId.get(id))
    .filter((achievement): achievement is PublicAchievement => !!achievement)
    .slice(0, 3);
  const visible = compact ? showcase : collection.earned.slice(0, 3);

  const openDetail = (achievement: PublicAchievement) => {
    setCollectionOpen(false);
    setDetail(achievement);
  };

  if (compact) {
    if (!showcase.length) return null;
    return (
      <>
        <section className="member-pins member-pins--compact" aria-label="Showcased achievements">
          {visible.map((achievement) => (
            <button
              className="member-pins__pin"
              key={achievement.id}
              onClick={() => openDetail(achievement)}
              aria-label={`View ${achievement.title}, ${tierName(highestTier(achievement), achievement)} badge`}
            >
              <BadgeIcon achievement={achievement} tier={highestTier(achievement)} />
            </button>
          ))}
        </section>
        {typeof document !== "undefined" && createPortal(<MemberPinSheet achievement={detail} collectionOpen={false} onClose={() => setDetail(null)} onBack={() => setDetail(null)} onOpenAchievement={openDetail} />, document.body)}
      </>
    );
  }

  return (
    <>
      <section className="member-pins member-pins--full" aria-label="Achievement cabinet">
        <div className="member-pins__heading">
          <div>
            <h3>Achievement cabinet</h3>
            <small>{collection.earned.length} {collection.earned.length === 1 ? "badge" : "badges"} earned</small>
          </div>
        </div>
        {visible.length ? (
          <ul className="member-pins__list">
            {visible.map((achievement) => {
              const tier = highestTier(achievement);
              return (
                <li key={achievement.id}>
                  <button className="member-pins__row" onClick={() => openDetail(achievement)} aria-label={`View ${achievement.title} badge details`}>
                    <BadgeIcon achievement={achievement} tier={tier} />
                    <span><strong>{achievement.title}</strong><small>{tierName(tier, achievement)} · {achievement.tiers.length} earned {achievement.tiers.length === 1 ? "tier" : "tiers"}</small></span>
                    <CaretRight size={18} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="member-pins__empty">No achievements earned yet.</p>}
        {collection.earned.length > 0 && <button className="member-pins__view-all" onClick={() => { setDetail(null); setCollectionOpen(true); }}>View full collection <CaretRight size={17} aria-hidden="true" /></button>}
      </section>
      {typeof document !== "undefined" && createPortal(<MemberPinSheet achievement={detail} collectionOpen={collectionOpen} onClose={() => { setDetail(null); setCollectionOpen(false); }} onBack={() => { setDetail(null); setCollectionOpen(true); }} onOpenAchievement={openDetail} collection={collection} />, document.body)}
    </>
  );
}

function MemberPinSheet({ achievement, collectionOpen, collection, onClose, onBack, onOpenAchievement }: {
  achievement: PublicAchievement | null;
  collectionOpen: boolean;
  collection?: PublicAchievementCollection;
  onClose: () => void;
  onBack: () => void;
  onOpenAchievement: (achievement: PublicAchievement) => void;
}) {
  const sheetOpen = !!achievement || collectionOpen;
  return (
    <Sheet open={sheetOpen} title={achievement?.title || "Achievement collection"} onClose={onClose}>
      {achievement ? <>
        <button className="member-pins__back" onClick={onBack}>
          <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          All achievements
        </button>
        <div className="member-pins__detail-heading">
          <BadgeIcon achievement={achievement} tier={highestTier(achievement)} size="large" />
          <div><span className="member-pins__eyebrow">{tierName(highestTier(achievement), achievement)} earned</span><h3>{achievement.title}</h3></div>
        </div>
        <p className="member-pins__description">{achievement.description}</p>
        <ol className="member-pins__tiers">
          {achievement.tiers.map((tier) => (
            <li key={tier.tier}>
              <span className="member-pins__tier-mark"><Medal size={18} weight="duotone" aria-hidden="true" /></span>
              <span><strong>{tierName(tier.tier, achievement)} badge</strong><small><CalendarBlank size={13} aria-hidden="true" /> Earned {formatDate(tier.earnedAt)}{tier.sessionName ? ` · ${tier.sessionName}` : ""}</small></span>
            </li>
          ))}
        </ol>
      </> : collection && <>
        <div className="member-pins__sheet-intro"><p>Earned badges and their milestones.</p><span>{collection.earned.length} earned</span></div>
        <ul className="member-pins__list">
          {collection.earned.map((item) => {
            const tier = highestTier(item);
            return <li key={item.id}><button className="member-pins__row" onClick={() => onOpenAchievement(item)} aria-label={`View ${item.title} badge details`}><BadgeIcon achievement={item} tier={tier} /><span><strong>{item.title}</strong><small>{tierName(tier, item)} · {item.tiers.length} earned {item.tiers.length === 1 ? "tier" : "tiers"}</small></span><CaretRight size={18} aria-hidden="true" /></button></li>;
          })}
        </ul>
      </>}
    </Sheet>
  );
}
