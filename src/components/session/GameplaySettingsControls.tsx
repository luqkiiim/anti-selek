"use client";

import {
  SessionBalanceMetric,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionPairingMode,
} from "@/types/enums";

const MATCHMAKING_STYLES = [
  SessionMatchmakingStyle.BALANCED,
  SessionMatchmakingStyle.SOCIAL,
  SessionMatchmakingStyle.LEVEL_MATCH,
] as const;

const MATCHMAKING_STYLE_INFO = {
  [SessionMatchmakingStyle.BALANCED]: {
    label: "Balanced",
    description: "Fair games with some variety.",
  },
  [SessionMatchmakingStyle.SOCIAL]: {
    label: "Social",
    description: "More variety, less focus on fairness.",
  },
  [SessionMatchmakingStyle.LEVEL_MATCH]: {
    label: "Level Match",
    description: "Play mostly with people close to your level.",
  },
} as const;

export function SegmentedGameplayOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-w-0 rounded-lg border px-3 py-2 text-center text-sm font-semibold transition ${
        selected
          ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      {label}
    </button>
  );
}

export function MatchmakingStyleControl({
  value,
  onChange,
}: {
  value: SessionMatchmakingStyle;
  onChange: (value: SessionMatchmakingStyle) => void;
}) {
  const info = MATCHMAKING_STYLE_INFO[value];
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-900">
        Matchmaking style
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value as SessionMatchmakingStyle)
          }
          className="field mt-1.5"
        >
          {MATCHMAKING_STYLES.map((style) => (
            <option key={style} value={style}>
              {MATCHMAKING_STYLE_INFO[style].label}
            </option>
          ))}
        </select>
      </label>
      <p className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 text-sm leading-5 text-gray-700">
        {info.description}
      </p>
    </div>
  );
}

export function CourtCountControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-gray-900">
      <span>Courts</span>
      <select
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        className="field"
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PairingModeControl({
  value,
  onChange,
  openLabel,
  mixedLabel,
}: {
  value: SessionPairingMode;
  onChange: (value: SessionPairingMode) => void;
  openLabel: string;
  mixedLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-gray-900">Pairing</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pairing">
        <SegmentedGameplayOption
          label={openLabel}
          selected={value === SessionPairingMode.OPEN}
          onClick={() => onChange(SessionPairingMode.OPEN)}
        />
        <SegmentedGameplayOption
          label={mixedLabel}
          selected={value === SessionPairingMode.MIXED}
          onClick={() => onChange(SessionPairingMode.MIXED)}
        />
      </div>
    </div>
  );
}

export function BalanceMetricControl({
  value,
  onChange,
}: {
  value: SessionBalanceMetric;
  onChange: (value: SessionBalanceMetric) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-gray-900">Balance by</p>
      <div className="grid min-w-0 grid-cols-2 gap-2" role="group" aria-label="Balance by">
        <SegmentedGameplayOption
          label="Tournament points"
          selected={value === SessionBalanceMetric.SESSION_POINTS}
          onClick={() => onChange(SessionBalanceMetric.SESSION_POINTS)}
        />
        <SegmentedGameplayOption
          label="Rating"
          selected={value === SessionBalanceMetric.RATING}
          onClick={() => onChange(SessionBalanceMetric.RATING)}
        />
      </div>
    </div>
  );
}

export function PlayerGroupsControl({
  enabled,
  disabled = false,
  onChange,
  description,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-4 sm:px-4"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900">
          Player groups
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-500">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
          enabled
            ? "border-blue-300 bg-blue-600"
            : "border-gray-300 bg-gray-100"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
            enabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

export function CrossoverFrequencyControl({
  value,
  onChange,
}: {
  value: SessionCrossoverFrequency;
  onChange: (value: SessionCrossoverFrequency) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Crossover frequency</p>
      <div
        role="group"
        aria-label="Crossover frequency"
        className="flex flex-wrap gap-2"
      >
        {[
          SessionCrossoverFrequency.OCCASIONAL,
          SessionCrossoverFrequency.BALANCED,
          SessionCrossoverFrequency.FREQUENT,
        ].map((frequency) => (
          <SegmentedGameplayOption
            key={frequency}
            label={
              frequency.charAt(0) + frequency.slice(1).toLowerCase()
            }
            selected={value === frequency}
            onClick={() => onChange(frequency)}
          />
        ))}
      </div>
      <p className="text-xs leading-5 text-gray-500">
        Availability and pairing rules may affect the actual rate.
      </p>
    </div>
  );
}
