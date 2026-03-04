import { describe, it, expect } from "vitest";
import { selectMatchPlayers, PlayerCandidate } from "./selectPlayers";

describe("selectMatchPlayers", () => {
  it("should select 4 players when enough are available", () => {
    const players: PlayerCandidate[] = [
      { userId: "1", matchesPlayed: 0, availableSince: new Date(1000) },
      { userId: "2", matchesPlayed: 0, availableSince: new Date(2000) },
      { userId: "3", matchesPlayed: 0, availableSince: new Date(3000) },
      { userId: "4", matchesPlayed: 0, availableSince: new Date(4000) },
      { userId: "5", matchesPlayed: 0, availableSince: new Date(5000) },
    ];
    const selected = selectMatchPlayers(players);
    expect(selected).toHaveLength(4);
  });

  it("should prioritize unpaused/late joiners eventually (waiting time)", () => {
    // 16 players with 4 matches, 4 players with 0 matches (unpaused now)
    const activePlayers: PlayerCandidate[] = Array.from({ length: 16 }, (_, i) => ({
      userId: `active_${i}`,
      matchesPlayed: 4,
      availableSince: new Date(1000), // Waiting for a long time since last match
    }));
    
    const unpausedPlayers: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `late_${i}`,
      matchesPlayed: 0,
      availableSince: new Date(2000), // Unpaused recently (after active players finished their matches)
    }));

    // In reality, active players finish their matches and their availableSince becomes NOW.
    // If active players just finished:
    const now = 5000;
    activePlayers.forEach(p => p.availableSince = new Date(now));
    
    // Late joiners unpaused slightly before that:
    unpausedPlayers.forEach(p => p.availableSince = new Date(now - 1000));

    const selected = selectMatchPlayers([...activePlayers, ...unpausedPlayers]);
    
    // With matchFloor, late joiners' effectiveCount becomes 4 (same as others).
    // Their availableSince is older (now-1000 vs now), so they should be picked.
    const lateSelected = selected!.filter(p => p.userId.startsWith("late_"));
    expect(lateSelected.length).toBeGreaterThan(0);
  });

  it("should prevent a bubble (max 2 from lowest cohort)", () => {
    // 4 players with 0 matches, 10 players with 1 match
    const lowCohort: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `low_${i}`,
      matchesPlayed: 0,
      availableSince: new Date(1000),
    }));
    
    const others: PlayerCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      userId: `other_${i}`,
      matchesPlayed: 1,
      availableSince: new Date(2000),
    }));

    const selected = selectMatchPlayers([...lowCohort, ...others]);
    
    const lowInSelection = selected!.filter(p => p.userId.startsWith("low_"));
    expect(lowInSelection.length).toBe(2);
    
    const othersInSelection = selected!.filter(p => p.userId.startsWith("other_"));
    expect(othersInSelection.length).toBe(2);
  });

  it("should handle the case where there are not enough 'others' to prevent a bubble", () => {
    // 4 players with 0 matches, 1 player with 1 match
    const lowCohort: PlayerCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      userId: `low_${i}`,
      matchesPlayed: 0,
      availableSince: new Date(1000),
    }));
    
    const others: PlayerCandidate[] = Array.from({ length: 1 }, (_, i) => ({
      userId: `other_${0}`,
      matchesPlayed: 1,
      availableSince: new Date(2000),
    }));

    const selected = selectMatchPlayers([...lowCohort, ...others]);
    
    // Bubble prevention shouldn't trigger because others.length < 2
    // It should just pick the top 4 based on effectiveCount and availableSince.
    // effectiveCount for lowCohort will be floor(avg(1)) = 1.
    // All have effectiveCount=1. lowCohort has older availableSince.
    const lowInSelection = selected!.filter(p => p.userId.startsWith("low_"));
    expect(lowInSelection.length).toBe(4);
  });

  it("should exclude paused time (waiting time resets on unpause)", () => {
    // Player A was playing, then paused for 1 hour, then unpaused.
    // Player B was waiting for 10 minutes.
    
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    
    const playerA: PlayerCandidate = {
      userId: "A",
      matchesPlayed: 2,
      availableSince: new Date(now), // Just unpaused
    };
    
    const playerB: PlayerCandidate = {
      userId: "B",
      matchesPlayed: 2,
      availableSince: new Date(tenMinAgo), // Waiting for 10 min
    };

    const others: PlayerCandidate[] = Array.from({ length: 3 }, (_, i) => ({
      userId: `other_${i}`,
      matchesPlayed: 2,
      availableSince: new Date(tenMinAgo - 1000),
    }));

    const selected = selectMatchPlayers([playerA, playerB, ...others]);
    
    // Player B and 'others' should be picked before Player A because their availableSince is older.
    const selectedIds = selected!.map(p => p.userId);
    expect(selectedIds).toContain("B");
    expect(selectedIds).not.toContain("A");
  });
});
