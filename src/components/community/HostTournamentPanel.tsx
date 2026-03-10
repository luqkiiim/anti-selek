"use client";

import { SessionMode, SessionType } from "@/types/enums";

interface HostTournamentPanelProps {
  newSessionName: string;
  onNewSessionNameChange: (value: string) => void;
  sessionType: SessionType;
  onSessionTypeChange: (type: SessionType) => void;
  sessionMode: SessionMode;
  onSessionModeChange: (mode: SessionMode) => void;
  openModeLabel: string;
  mixedModeLabel: string;
  courtCount: number;
  onCourtCountChange: (count: number) => void;
  selectedPlayerCount: number;
  guestCount: number;
  onOpenPlayers: () => void;
  onOpenGuests: () => void;
  onCreateSession: () => void;
  creatingSession: boolean;
}

export function HostTournamentPanel({
  newSessionName,
  onNewSessionNameChange,
  sessionType,
  onSessionTypeChange,
  sessionMode,
  onSessionModeChange,
  openModeLabel,
  mixedModeLabel,
  courtCount,
  onCourtCountChange,
  selectedPlayerCount,
  guestCount,
  onOpenPlayers,
  onOpenGuests,
  onCreateSession,
  creatingSession,
}: HostTournamentPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-blue-200/70 bg-[linear-gradient(145deg,#0d3f88,#1677f2)] p-6 shadow-xl shadow-blue-100 space-y-5 text-white">
      <div>
        <h3 className="mb-1 text-sm font-black uppercase tracking-widest !text-white">
          Host Tournament
        </h3>
        <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider">
          Create a tournament for players in this community.
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={newSessionName}
          onChange={(e) => onNewSessionNameChange(e.target.value)}
          placeholder="Tournament Name"
          className="w-full bg-blue-500/50 border-2 border-blue-400/30 rounded-2xl px-4 py-3 placeholder:text-blue-200 font-bold focus:outline-none focus:border-white transition-all"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSessionTypeChange(SessionType.POINTS)}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              sessionType === SessionType.POINTS
                ? "bg-white text-blue-600 shadow-md"
                : "bg-blue-500/30 text-white"
            }`}
          >
            Points Format
          </button>
          <button
            type="button"
            onClick={() => onSessionTypeChange(SessionType.ELO)}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              sessionType === SessionType.ELO
                ? "bg-white text-blue-600 shadow-md"
                : "bg-blue-500/30 text-white"
            }`}
          >
            Ratings Format
          </button>
        </div>
        <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
          {sessionType === SessionType.POINTS
            ? "Points based matchmaking"
            : "Ratings based matchmaking"}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSessionModeChange(SessionMode.MEXICANO)}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              sessionMode === SessionMode.MEXICANO
                ? "bg-white text-blue-600 shadow-md"
                : "bg-blue-500/30 text-white"
            }`}
          >
            {openModeLabel}
          </button>
          <button
            type="button"
            onClick={() => onSessionModeChange(SessionMode.MIXICANO)}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              sessionMode === SessionMode.MIXICANO
                ? "bg-white text-blue-600 shadow-md"
                : "bg-blue-500/30 text-white"
            }`}
          >
            {mixedModeLabel}
          </button>
        </div>
        <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
          {sessionMode === SessionMode.MEXICANO
            ? "Open doubles rotation."
            : "Mixed doubles rules enabled."}
        </p>

        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">
            Courts Available
          </p>
          <select
            value={courtCount}
            onChange={(e) => onCourtCountChange(parseInt(e.target.value, 10))}
            className="w-full bg-blue-500/50 border-2 border-blue-400/30 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-white transition-all"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count} className="text-gray-900">
                {count} Court{count > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="bg-blue-700/30 border border-white/20 rounded-xl px-3 py-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">
              Players
            </p>
            <p className="text-xs font-bold">{selectedPlayerCount} selected</p>
            <button
              type="button"
              onClick={onOpenPlayers}
              className="w-full bg-white text-blue-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
            >
              Add Players
            </button>
          </div>
          <div className="bg-blue-700/30 border border-white/20 rounded-xl px-3 py-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">
              Guests
            </p>
            <p className="text-xs font-bold">{guestCount} pre-added</p>
            <button
              type="button"
              onClick={onOpenGuests}
              className="w-full bg-white text-blue-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
            >
              Add Guests
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onCreateSession}
          disabled={creatingSession || !newSessionName.trim()}
          className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creatingSession ? "Creating..." : "Create Tournament"}
        </button>
      </div>
    </div>
  );
}
