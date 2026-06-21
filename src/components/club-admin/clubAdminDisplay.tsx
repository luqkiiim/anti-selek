"use client";

import type { ClubAdminPlayer } from "./clubAdminTypes";
import { getClubRoleLabel } from "@/lib/clubRoles";
import { getMixedSideDisplayLabel } from "@/lib/mixedSide";
import { ClubPlayerStatus, PlayerGender } from "@/types/enums";

export function getClubAdminGenderPillLabel(
  player: ClubAdminPlayer
) {
  if (player.gender === PlayerGender.FEMALE || player.gender === PlayerGender.MALE) {
    const mixedSideLabel = getMixedSideDisplayLabel({
      gender: player.gender,
      mixedSideOverride: player.mixedSideOverride,
      partnerPreference: player.partnerPreference,
    });

    if (mixedSideLabel !== "Default") {
      return `${player.gender === PlayerGender.FEMALE ? "Female" : "Male"}/${mixedSideLabel === "Upper Side" ? "Upper" : "Lower"}`;
    }

    return player.gender === PlayerGender.FEMALE ? "Female" : "Male";
  }

  return "Player";
}

export function ClubAdminRolePill({
  role,
  isOwner = false,
}: {
  role: ClubAdminPlayer["role"];
  isOwner?: boolean;
}) {
  const baseClassName =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]";

  if (isOwner) {
    return (
      <span
        className={`${baseClassName} border-[#bbf7d0] bg-[#dcfce7] text-[#166534]`}
      >
        Owner
      </span>
    );
  }

  if (role === "ADMIN") {
    return (
      <span
        className={`${baseClassName} border-[#ddd6fe] bg-[#ede9fe] text-[#5b21b6]`}
      >
        {getClubRoleLabel(role)}
      </span>
    );
  }

  if (role === "STAFF") {
    return (
      <span
        className={`${baseClassName} border-[#fde68a] bg-[#fef3c7] text-[#92400e]`}
      >
        {getClubRoleLabel(role)}
      </span>
    );
  }

  return (
    <span
      className={`${baseClassName} border-[#bfdbfe] bg-[#dbeafe] text-[#1e40af]`}
    >
      {getClubRoleLabel(role)}
    </span>
  );
}

export function ClubAdminClaimPill({
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

export function ClubAdminGenderPill({
  player,
}: {
  player: ClubAdminPlayer;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-700">
      {getClubAdminGenderPillLabel(player)}
    </span>
  );
}

export function ClubAdminStatusPill({
  status,
}: {
  status: ClubAdminPlayer["status"];
}) {
  if (status === ClubPlayerStatus.OCCASIONAL) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
        Occasional
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">
      Core
    </span>
  );
}
