"use client";

import type { CommunityPageMember } from "./communityTypes";

interface CommunityPlayersModalProps {
  open: boolean;
  selectedPlayerIds: string[];
  playerSearch: string;
  selectablePlayers: CommunityPageMember[];
  filteredSelectablePlayers: CommunityPageMember[];
  onPlayerSearchChange: (value: string) => void;
  onToggleAllPlayers: () => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onClose: () => void;
}

export function CommunityPlayersModal({
  open,
  selectedPlayerIds,
  playerSearch,
  selectablePlayers,
  filteredSelectablePlayers,
  onPlayerSearchChange,
  onToggleAllPlayers,
  onTogglePlayerSelection,
  onClose,
}: CommunityPlayersModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-gray-900">Add Players</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
              {selectedPlayerIds.length} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
          >
            &times;
          </button>
        </div>

        <div className="px-3 py-2 border-b bg-gray-50/50 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search players..."
              value={playerSearch}
              onChange={(event) => onPlayerSearchChange(event.target.value)}
              className="w-full h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <button
              type="button"
              onClick={onToggleAllPlayers}
              className="h-9 bg-gray-900 text-white px-3 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
            >
              {selectedPlayerIds.length === selectablePlayers.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {filteredSelectablePlayers.length === 0 ? (
            <div className="text-center py-10 text-gray-400 italic text-sm">
              No players found.
            </div>
          ) : (
            filteredSelectablePlayers.map((player) => {
              const isSelected = selectedPlayerIds.includes(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onTogglePlayerSelection(player.id)}
                  className={`w-full flex justify-between items-center px-3 py-2 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-black text-sm text-gray-900 truncate">
                      {player.name}
                    </p>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                      Rating {player.elo}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      isSelected ? "text-blue-600" : "text-gray-400"
                    }`}
                  >
                    {isSelected ? "Selected" : "Add"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 bg-white border-t sm:rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
