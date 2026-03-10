"use client";

import type { FormEvent } from "react";
import { PlayerGender } from "@/types/enums";

interface CreatePlayerProfilePanelProps {
  name: string;
  onNameChange: (value: string) => void;
  newPlayerGender: PlayerGender;
  onNewPlayerGenderChange: (value: PlayerGender) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreatePlayerProfilePanel({
  name,
  onNameChange,
  newPlayerGender,
  onNewPlayerGenderChange,
  onSubmit,
}: CreatePlayerProfilePanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
        Create Player Profile
      </h3>
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
        Add a player to this community.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
          placeholder="Player Name"
          required
        />
        <select
          value={newPlayerGender}
          onChange={(e) => onNewPlayerGenderChange(e.target.value as PlayerGender)}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
        >
          <option value={PlayerGender.MALE}>Male</option>
          <option value={PlayerGender.FEMALE}>Female</option>
        </select>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
        >
          Create Profile
        </button>
      </form>
    </div>
  );
}
