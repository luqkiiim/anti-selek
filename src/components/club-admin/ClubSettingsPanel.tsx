"use client";

import type { FormEvent } from "react";
import { AvatarUploader } from "@/components/ui/AvatarUploader";

interface ClubSettingsPanelProps {
  clubName: string;
  clubAvatarUrl?: string | null;
  onClubNameChange: (value: string) => void;
  clubPassword: string;
  onClubPasswordChange: (value: string) => void;
  passwordProtectionEnabled: boolean;
  onPasswordProtectionEnabledChange: (value: boolean) => void;
  isPasswordProtected: boolean;
  isTutorial?: boolean;
  onUploadAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}

export function ClubSettingsPanel({
  clubName,
  clubAvatarUrl = null,
  onClubNameChange,
  clubPassword,
  onClubPasswordChange,
  passwordProtectionEnabled,
  onPasswordProtectionEnabledChange,
  isPasswordProtected,
  isTutorial = false,
  onUploadAvatar,
  onRemoveAvatar,
  onSubmit,
  saving,
}: ClubSettingsPanelProps) {
  if (isTutorial) {
    return (
      <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
              Tutorial Settings
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              This sandbox resets instead of being renamed or password protected.
            </p>
          </div>
          <span className="rounded-lg bg-blue-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
            Sandbox
          </span>
        </div>

        <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wider text-gray-900">
            Display name
          </p>
          <p className="mt-2 text-base font-bold text-gray-900">
            {clubName}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            The private backend name stays hidden so your tutorial always feels
            like the same playground.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            Club Settings
          </h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Rename the club, update its password, or make it public.
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

      <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-wider text-gray-900">
          Club profile picture
        </p>
        <div className="mt-3">
          <AvatarUploader
            name={clubName}
            avatarUrl={clubAvatarUrl}
            size="xl"
            helperText="Use a clear club logo or photo. It will appear in club vs club standings and other club surfaces."
            onUpload={onUploadAvatar}
            onRemove={onRemoveAvatar}
          />
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          value={clubName}
          onChange={(e) => onClubNameChange(e.target.value)}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
          placeholder="Club name"
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
                  : "Set a password below to lock this club."
                : isPasswordProtected
                  ? "Saving will remove the password and make the club public."
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
            value={clubPassword}
            onChange={(e) => onClubPasswordChange(e.target.value)}
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
