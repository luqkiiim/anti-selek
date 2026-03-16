"use client";

import type { CommunityAdminPlayer } from "./communityAdminTypes";
import { PartnerPreference, PlayerGender } from "@/types/enums";

export function getCommunityAdminGenderPillLabel(
  player: CommunityAdminPlayer
) {
  if (player.gender === PlayerGender.FEMALE) {
    return player.partnerPreference === PartnerPreference.OPEN
      ? "Female/Open"
      : "Female";
  }

  return "Male";
}

export function CommunityAdminRolePill({
  role,
}: {
  role: CommunityAdminPlayer["role"];
}) {
  const baseClassName =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]";

  if (role === "ADMIN") {
    return (
      <span
        className={`${baseClassName} border-[#ddd6fe] bg-[#ede9fe] text-[#5b21b6]`}
      >
        {role}
      </span>
    );
  }

  return (
    <span
      className={`${baseClassName} border-[#bfdbfe] bg-[#dbeafe] text-[#1e40af]`}
    >
      {role}
    </span>
  );
}

export function CommunityAdminClaimPill({
  isClaimed,
}: {
  isClaimed: boolean;
}) {
  if (isClaimed) {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-800">
        Claimed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
      Unclaimed
    </span>
  );
}

export function CommunityAdminGenderPill({
  player,
}: {
  player: CommunityAdminPlayer;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-700">
      {getCommunityAdminGenderPillLabel(player)}
    </span>
  );
}
