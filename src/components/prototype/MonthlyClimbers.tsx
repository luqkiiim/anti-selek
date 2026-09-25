"use client";

import type { ClubPulseMonthlyClimber } from "@/lib/clubPulse";
import { TrendUp } from "@phosphor-icons/react";
import { Avatar } from "./Primitives";

export function MonthlyClimbers({
  climbers,
  month,
  onOpenProfile,
}: {
  climbers: ClubPulseMonthlyClimber[];
  month: string;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <section className="monthly-climbers-section" aria-label="Monthly climbers">
      <div className="section-heading">
        <h3>Monthly climbers</h3>
        <TrendUp size={21} weight="duotone" aria-hidden="true" />
      </div>
      <p className="monthly-climbers-context">{month}</p>
      {climbers.length > 0 ? (
        <ol className="monthly-climbers-list chemistry-card">
          {climbers.map(({ user, ratingGain }, index) => (
            <li className="monthly-climber-row" key={user.id}>
              <span className="chemistry-rank" aria-label={`Rank ${index + 1}`}>
                {index + 1}
              </span>
              <button
                className="monthly-climber-avatar profile-person-link"
                aria-label={`View ${user.name} profile`}
                onClick={() => onOpenProfile(user.id)}
              >
                <Avatar name={user.name} url={user.avatarUrl} />
              </button>
              <button
                className="monthly-climber-name profile-person-link"
                onClick={() => onOpenProfile(user.id)}
              >
                {user.name}
              </button>
              <span className="monthly-climber-gain"><strong>+{ratingGain}</strong><small>rating</small></span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="monthly-climbers-empty">
          <p>This month’s climbers will appear as players gain rating.</p>
        </div>
      )}
    </section>
  );
}
