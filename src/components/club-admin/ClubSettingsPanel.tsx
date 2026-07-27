"use client";

import type { FormEvent } from "react";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import styles from "@/features/club-admin-page/ClubAdminPage.module.css";

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
      <section
        className={styles.adminPanel}
        data-owner-admin-panel="settings"
        aria-labelledby="tutorial-settings-heading"
      >
        <div className={styles.panelHeader}>
          <div className={styles.panelHeadingCopy}>
            <p className={styles.panelEyebrow}>Sandbox controls</p>
            <h3 id="tutorial-settings-heading">Tutorial Settings</h3>
            <span>
              This sandbox resets instead of being renamed or password protected.
            </span>
          </div>
          <span className={styles.countBadge}>
            Sandbox
          </span>
        </div>

        <div className={styles.readonlySetting}>
          <p>
            Display name
          </p>
          <strong>
            {clubName}
          </strong>
          <span>
            The private backend name stays hidden so your tutorial always feels
            like the same playground.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.adminPanel}
      data-owner-admin-panel="settings"
      aria-labelledby="club-settings-heading"
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelHeadingCopy}>
          <p className={styles.panelEyebrow}>Club identity</p>
          <h3 id="club-settings-heading">Club settings</h3>
          <span>
            Rename the club, update its password, or make it public.
          </span>
        </div>
        <span
          className={`${styles.countBadge} ${
            isPasswordProtected
              ? styles.protectedBadge
              : ""
          }`}
        >
          {isPasswordProtected ? "Protected" : "Open"}
        </span>
      </div>

      <div className={styles.avatarSetting}>
        <p>
          Club profile picture
        </p>
        <div>
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

      <form onSubmit={onSubmit} className={styles.settingsForm}>
        <label className={styles.fieldGroup}>
          <span className={styles.settingLabel}>Club name</span>
          <input
            type="text"
            value={clubName}
            onChange={(e) => onClubNameChange(e.target.value)}
            className={styles.fieldControl}
            placeholder="Club name"
            required
          />
        </label>
        <label className={styles.toggleSetting}>
          <div className="min-w-0">
            <p>
              Password protected
            </p>
            <span>
              {passwordProtectionEnabled
                ? isPasswordProtected
                  ? "Members currently need a password to join."
                  : "Set a password below to lock this club."
                : isPasswordProtected
                  ? "Saving will remove the password and make the club public."
                  : "Anyone can join without a password."}
            </span>
          </div>
          <input
            type="checkbox"
            checked={passwordProtectionEnabled}
            onChange={(e) =>
              onPasswordProtectionEnabledChange(e.target.checked)
            }
            className={styles.settingsCheckbox}
            aria-label="Password protected"
          />
        </label>
        {passwordProtectionEnabled ? (
          <label className={styles.fieldGroup}>
            <span className={styles.settingLabel}>Club password</span>
            <input
              type="password"
              value={clubPassword}
              onChange={(e) => onClubPasswordChange(e.target.value)}
              className={styles.fieldControl}
              placeholder={
                isPasswordProtected
                  ? "New password (leave blank to keep current)"
                  : "Set a password (min 4 characters)"
              }
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className={`${styles.primaryAction} ${styles.saveButton}`}
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </form>
    </section>
  );
}
