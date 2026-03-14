import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { selectMatchPlayers, PlayerCandidate } from "./selectPlayers";

describe("selectMatchPlayers (Match Rate Logic)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should select 4 players when enough are available", () => {
    const now = Date.now();
    const players: PlayerCandidate[] = Array.from({ length: 5 }, (_, i) => ({
      userId: `${i}`,
      matchesPlayed: 0,
      availableSince: new Date(now - 1000),
      joinedAt: new Date(now - 2000),
      inactiveSeconds: 0,
    }));
    const selected = selectMatchPlayers(players);
    expect(selected).toHaveLength(4);
  });

  it("should prioritize fewer matches played before a lower match rate", () => {
    const t0 = Date.now();

    const underplayed: PlayerCandidate = {
      userId: "underplayed",
      matchesPlayed: 2,
      joinedAt: new Date(t0 - 10 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 30 * 1000),
    };

    const lowerRateButOverplayed: PlayerCandidate = {
      userId: "overplayed",
      matchesPlayed: 3,
      joinedAt: new Date(t0 - 4 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 40 * 1000),
    };

    const extras: PlayerCandidate[] = Array.from({ length: 3 }, (_, i) => ({
      userId: `extra_${i}`,
      matchesPlayed: 2,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - (60 + i) * 1000),
    }));

    const selected = selectMatchPlayers([underplayed, lowerRateButOverplayed, ...extras]);
    const selectedIds = selected!.map((player) => player.userId);

    expect(selectedIds).toContain("underplayed");
    expect(selectedIds).not.toContain("overplayed");
  });

  it("should NOT prioritize late joiners for 'catch up' if their rate is higher", () => {
    const t0 = Date.now(); // This is now the mocked 'now'
    
    // Early players: joined 2 hours ago, played 8 matches
    // Rate: 8 matches / 2 hours = 4 matches/hour
    const earlyPlayers: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `early_${i}`,
      matchesPlayed: 8,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0),
    }));

    // Late players: joined 1 hour ago, played 8 matches (SAME as early)
    // Rate: 8 matches / 1 hour = 8 matches/hour
    const latePlayers: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `late_${i}`,
      matchesPlayed: 8,
      joinedAt: new Date(t0 - 1 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0),
    }));

    // Add extra players with very high rate
    const extra: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `extra_${i}`,
      matchesPlayed: 8, 
      joinedAt: new Date(t0 - 0.5 * 60 * 60 * 1000), // joined 30 min ago, 16/hour
      inactiveSeconds: 0,
      availableSince: new Date(t0),
    }));

    const selected = selectMatchPlayers([...earlyPlayers, ...latePlayers, ...extra]);
    
    // Early players have a lower rate (4 vs 8 vs 16), so they should be selected
    const selectedIds = selected!.map(p => p.userId);
    earlyPlayers.forEach(p => {
      expect(selectedIds).toContain(p.userId);
    });
    latePlayers.forEach(p => {
      expect(selectedIds).not.toContain(p.userId);
    });
  });

  it("should exclude paused time from the rate calculation", () => {
    const t0 = Date.now();
    
    // Player A: joined 2 hours ago, played 4 matches, NO inactive time
    // Rate: 4 / 2h = 2 matches/hour
    const playerA: PlayerCandidate = {
      userId: "A",
      matchesPlayed: 4,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0),
    };

    // Player B: joined 2 hours ago, played 4 matches, but was PAUSED for 1 hour
    // Rate: 4 / (2h - 1h) = 4 matches/hour
    const playerB: PlayerCandidate = {
      userId: "B",
      matchesPlayed: 4,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 3600, // 1 hour
      availableSince: new Date(t0),
    };

    // 6 Extra players with very LOW rate (e.g. 1 match in 4 hours = 0.25/hour)
    // We give them 4 matches (same as A and B) but joined 16 hours ago.
    const extra: PlayerCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      userId: `extra_${i}`,
      matchesPlayed: 4, 
      joinedAt: new Date(t0 - 16 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 1000), // waiting 1s longer
    }));

    const selected = selectMatchPlayers([playerA, playerB, ...extra]);
    
    // Rates:
    // A: 2/hour
    // B: 4/hour
    // Extras: 0.25/hour
    // Selected should be 4 Extras. Neither A nor B should be in.
    const selectedIds = selected!.map(p => p.userId);
    expect(selectedIds).not.toContain("A");
    expect(selectedIds).not.toContain("B");
  });

  it("should prioritize Player A over Player B when slots are limited", () => {
    const t0 = Date.now();
    
    const playerA: PlayerCandidate = {
      userId: "A",
      matchesPlayed: 4,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0),
    };

    const playerB: PlayerCandidate = {
      userId: "B",
      matchesPlayed: 4,
      joinedAt: new Date(t0 - 2 * 60 * 60 * 1000),
      inactiveSeconds: 3600, // 1 hour
      availableSince: new Date(t0),
    };

    // 3 Extras with low rate (same matchesPlayed)
    const extra: PlayerCandidate[] = Array.from({ length: 3 }, (_, i) => ({
      userId: `extra_${i}`,
      matchesPlayed: 4, 
      joinedAt: new Date(t0 - 16 * 60 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 1000),
    }));

    const selected = selectMatchPlayers([playerA, playerB, ...extra]);
    
    // Slots: 3 Extras (0.25 rate) + 1 more
    // A (2 rate) vs B (4 rate)
    // A should be selected.
    const selectedIds = selected!.map(p => p.userId);
    expect(selectedIds).toContain("A");
    expect(selectedIds).not.toContain("B");
  });

  it("should prevent a mini-bubble for a small rejoin cohort", () => {
    const t0 = Date.now();
    
    // 4 rejoiners with 0 matches
    const lowCohort: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `low_${i}`,
      matchesPlayed: 0,
      joinedAt: new Date(t0 - 10 * 60 * 1000), // joined 10 min ago
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 10 * 60 * 1000),
    }));
    
    // 12 established players with higher match counts
    const others: PlayerCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      userId: `other_${i}`,
      matchesPlayed: 10,
      joinedAt: new Date(t0 - 200 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 100 * 60 * 1000),
    }));

    const selected = selectMatchPlayers([...lowCohort, ...others]);
    
    // In a 4/16 cohort split, select only 1 low player to avoid low-low bubbling.
    const lowInSelection = selected!.filter(p => p.userId.startsWith("low_"));
    expect(lowInSelection.length).toBe(1);
    
    const othersInSelection = selected!.filter(p => p.userId.startsWith("other_"));
    expect(othersInSelection.length).toBe(3);
  });

  it("should still select 2 from lowest cohort when others are scarce", () => {
    const t0 = Date.now();

    const lowCohort: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `low_${i}`,
      matchesPlayed: 0,
      joinedAt: new Date(t0 - 10 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 10 * 60 * 1000),
    }));

    const others: PlayerCandidate[] = Array.from({ length: 2 }, (_, i) => ({
      userId: `other_${i}`,
      matchesPlayed: 10,
      joinedAt: new Date(t0 - 200 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 100 * 60 * 1000),
    }));

    const selected = selectMatchPlayers([...lowCohort, ...others]);
    const lowInSelection = selected!.filter((p) => p.userId.startsWith("low_"));
    const othersInSelection = selected!.filter((p) => p.userId.startsWith("other_"));

    expect(lowInSelection.length).toBe(2);
    expect(othersInSelection.length).toBe(2);
  });

  it("should not treat a normal underplayed cohort as a rejoin bubble", () => {
    const t0 = Date.now();

    const lowCohort: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `low_${i}`,
      matchesPlayed: 8,
      joinedAt: new Date(t0 - 200 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 100 * 60 * 1000),
    }));

    const others: PlayerCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      userId: `other_${i}`,
      matchesPlayed: 9,
      joinedAt: new Date(t0 - 200 * 60 * 1000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - 10 * 60 * 1000),
    }));

    const selected = selectMatchPlayers([...lowCohort, ...others]);
    const selectedIds = selected!.map((player) => player.userId);

    lowCohort.forEach((player) => {
      expect(selectedIds).toContain(player.userId);
    });
  });

  it("should prioritize by availableSince when rates are equal", () => {
    const t0 = Date.now();
    
    // All joined at same time, same matches
    const players: PlayerCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      userId: `${i}`,
      matchesPlayed: 0,
      joinedAt: new Date(t0 - 10000),
      inactiveSeconds: 0,
      availableSince: new Date(t0 - (i * 1000)), // Player 5 waiting longest
    }));

    const selected = selectMatchPlayers(players);
    const selectedIds = selected!.map(p => p.userId);
    
    // Should pick those who waited longest: 5, 4, 3, 2
    expect(selectedIds).toContain("5");
    expect(selectedIds).toContain("4");
    expect(selectedIds).toContain("3");
    expect(selectedIds).toContain("2");
    expect(selectedIds).not.toContain("0");
    expect(selectedIds).not.toContain("1");
  });
});
