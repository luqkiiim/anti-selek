"use client";

import "./first-session.css";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { MixedSide, PlayerGender } from "@/types/enums";

export function MixedPairingControl({ gender, value, onChange, disabled = false }: {
  gender: PlayerGender;
  value: MixedSide | null;
  onChange: (value: MixedSide | null) => void;
  disabled?: boolean;
}) {
  const option = getMixedSideOverrideOptionForGender(gender);
  if (!option) return null;
  return <details className="pairing-options">
    <summary>Advanced pairing</summary>
    <label className="field-label">Mixed-pairing level
      <select aria-label="Mixed-pairing level" value={value ?? ""} disabled={disabled} onChange={event => onChange(event.target.value as MixedSide || null)}>
        <option value="">Standard</option>
        <option value={option.value}>{option.label}</option>
      </select>
    </label>
    <p className="muted pairing-help">{gender === PlayerGender.FEMALE
      ? "Higher-level women use the men’s pairing group."
      : "Lower-level men use the women’s pairing group."} Club rating stays unchanged.</p>
  </details>;
}
