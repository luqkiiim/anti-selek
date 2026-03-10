"use client";

import type { FormEvent } from "react";

interface CommunitySettingsPanelProps {
  communityName: string;
  onCommunityNameChange: (value: string) => void;
  communityPassword: string;
  onCommunityPasswordChange: (value: string) => void;
  isPasswordProtected: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}

export function CommunitySettingsPanel({
  communityName,
  onCommunityNameChange,
  communityPassword,
  onCommunityPasswordChange,
  isPasswordProtected,
  onSubmit,
  saving,
}: CommunitySettingsPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            Community Settings
          </h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Rename the community or set a new password.
          </p>
        </div>
        <span
          className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
            isPasswordProtected
              ? "bg-amber-100 text-amber-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {isPasswordProtected ? "Protected" : "Open"}
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          value={communityName}
          onChange={(e) => onCommunityNameChange(e.target.value)}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
          placeholder="Community name"
          required
        />
        <input
          type="password"
          value={communityPassword}
          onChange={(e) => onCommunityPasswordChange(e.target.value)}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
          placeholder="New password (leave blank to keep current)"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
