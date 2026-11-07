"use client";
import { CaretLeft, GearSix } from "@phosphor-icons/react";
import { Avatar } from "@/components/product/Primitives";
import type { ClubIdentity } from "./clubReadStore";

export function ClubHeader({ identity, globalView = false, heading = false, onSwitch, onManage }: {
  identity: ClubIdentity; globalView?: boolean; heading?: boolean; onSwitch: () => void; onManage?: () => void;
}) {
  const Title = heading ? "h1" : "div";
  return <header className="pc-header">
    <Title className="club-header-title" aria-label={heading ? identity.name || undefined : undefined}>
    <button className="club-switcher" aria-label={identity.name ? `Switch club, current ${identity.name}` : "Switch club"} onClick={onSwitch}>
      {!heading && <small>{globalView ? "CLUB" : "YOUR CLUB"}</small>}
      <strong><CaretLeft size={16} aria-hidden="true" />{identity.name || <span className="club-name-skeleton" role="status" aria-label="Loading club name" />}</strong>
    </button>
    </Title>
    <div className="club-header-actions">
      {onManage && <button className="icon-button" aria-label="Manage club" title="Manage club" onClick={onManage}><GearSix size={25} /></button>}
      {identity.name ? <span aria-label={`${identity.name} club photo`}><Avatar name={identity.name} url={identity.avatarUrl} /></span> : <span className="club-avatar-skeleton" aria-hidden="true" />}
    </div>
  </header>;
}
