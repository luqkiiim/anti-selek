"use client";

import { useEffect, useState } from "react";
import { getErrorMessage, safeJson } from "@/lib/http";
import type { EligibleSessionProfile } from "./sessionTypes";

function profileKey(profile: Pick<EligibleSessionProfile, "playerId" | "profileClubId">) {
  return `${profile.playerId}:${profile.profileClubId}`;
}

export function SessionJoinProfilePanel({
  code,
  sessionStatus,
  eligibleProfiles,
  selectedSelf,
  isInterclub,
  onJoined,
}: {
  code: string;
  sessionStatus: string;
  eligibleProfiles: EligibleSessionProfile[];
  selectedSelf: Pick<EligibleSessionProfile, "playerId" | "profileClubId"> | null;
  isInterclub: boolean;
  onJoined: (profile: EligibleSessionProfile) => void;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedSelf) {
      setSelectedKey(profileKey(selectedSelf));
      return;
    }

    if (eligibleProfiles.length === 1) {
      setSelectedKey(profileKey(eligibleProfiles[0]));
      return;
    }

    setSelectedKey((current) =>
      eligibleProfiles.some((profile) => profileKey(profile) === current)
        ? current
        : ""
    );
  }, [eligibleProfiles, selectedSelf]);

  if (
    selectedSelf ||
    sessionStatus === "COMPLETED" ||
    eligibleProfiles.length === 0
  ) {
    return null;
  }

  const chosenProfile = eligibleProfiles.find(
    (profile) => profileKey(profile) === selectedKey
  );

  async function join() {
    if (!chosenProfile || joining) return;
    setJoining(true);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: chosenProfile.playerId,
          profileClubId: chosenProfile.profileClubId,
          representingClubId: isInterclub
            ? chosenProfile.profileClubId
            : null,
        }),
      });
      const data = await safeJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(getErrorMessage(data, "Unable to join this session"));
        return;
      }
      onJoined(chosenProfile);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Unable to join this session"
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <section className="app-panel space-y-3 p-4 sm:p-5" aria-label="Join session">
      <div>
        <h2 className="text-base font-bold text-gray-900">Join this session</h2>

      </div>
      {eligibleProfiles.length === 1 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Playing as <strong>{eligibleProfiles[0].playerName}</strong> · {eligibleProfiles[0].clubName}
        </p>
      ) : (
        <label className="field-label">
          Play as
          <select
            aria-label="Play as"
            className="field mt-1 w-full"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            disabled={joining}
          >
            <option value="">Choose a club profile</option>
            {eligibleProfiles.map((profile) => (
              <option key={profileKey(profile)} value={profileKey(profile)}>
                {profile.playerName} · {profile.clubName}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        className="app-button-primary"
        disabled={!chosenProfile || joining}
        onClick={() => void join()}
      >
        {joining ? "Joining…" : "Join session"}
      </button>
    </section>
  );
}
