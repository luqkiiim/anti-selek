"use client";

import type { FormEvent } from "react";

interface CommunitySettingsPanelProps {
  communityName: string;
  onCommunityNameChange: (value: string) => void;
  communityPassword: string;
  onCommunityPasswordChange: (value: string) => void;
  passwordProtectionEnabled: boolean;
  onPasswordProtectionEnabledChange: (value: boolean) => void;
  isPasswordProtected: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}

export function CommunitySettingsPanel({
  communityName,
  onCommunityNameChange,
  communityPassword,
  onCommunityPasswordChange,
  passwordProtectionEnabled,
  onPasswordProtectionEnabledChange,
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
            Rename the community, update its password, or make it public.
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
        <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-gray-900">
              Password Protected
            </p>
            <p className="text-[11px] text-gray-500">
              {passwordProtectionEnabled
                ? isPasswordProtected
                  ? "Members currently need a password to join."
                  : "Set a password below to lock this community."
                : isPasswordProtected
                  ? "Saving will remove the password and make the community public."
                  : "Anyone can join without a password."}
            </p>
          </div>
          <input
            type="checkbox"
            checked={passwordProtectionEnabled}
            onChange={(e) =>
              onPasswordProtectionEnabledChange(e.target.checked)
            }
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label="Password protected"
          />
        </label>
        {passwordProtectionEnabled ? (
          <input
            type="password"
            value={communityPassword}
            onChange={(e) => onCommunityPasswordChange(e.target.value)}
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
            placeholder={
              isPasswordProtected
                ? "New password (leave blank to keep current)"
                : "Set a password (min 4 characters)"
            }
          />
        ) : null}
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
