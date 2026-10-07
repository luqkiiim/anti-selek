export type SocialGeneralizationSide = "UPPER" | "LOWER";

export interface SocialGeneralizationJoinPlayer {
  readonly userId: string;
  readonly side: SocialGeneralizationSide;
}

export type SocialGeneralizationRosterEvent =
  | {
      readonly type: "join";
      /** Earliest event boundary, measured in completed matches. */
      readonly afterCompletedMatches: number;
      readonly players: readonly SocialGeneralizationJoinPlayer[];
    }
  | {
      readonly type: "pause" | "resume";
      /** Earliest event boundary, measured in completed matches. */
      readonly afterCompletedMatches: number;
      readonly userId: string;
    };

export interface SocialGeneralizationScenario {
  readonly id: string;
  readonly initialUpper: number;
  readonly initialLower: number;
  readonly courtCount: number;
  /** Short checkpoint, about six appearances per player at the largest roster. */
  readonly shortHorizonMatches: number;
  readonly longDiagnostic: boolean;
  readonly events: readonly SocialGeneralizationRosterEvent[];
}

export interface SocialGeneralizationStructuralPlayer {
  readonly userId: string;
  readonly side: SocialGeneralizationSide;
  /** Paused players remain in structural opportunity sets. */
  readonly isPaused: boolean;
}

function shortHorizon(playerCount: number) {
  return Math.round((6 * playerCount) / 4);
}

function fixedScenario(
  id: string,
  upper: number,
  lower: number,
  courtCount: number,
  longDiagnostic = false,
): SocialGeneralizationScenario {
  return {
    id,
    initialUpper: upper,
    initialLower: lower,
    courtCount,
    shortHorizonMatches: shortHorizon(upper + lower),
    longDiagnostic,
    events: [],
  };
}

/**
 * Deterministic Social Mix scenarios for validating the opt-in
 * courtmate-beneficial-rescue policy. Event counts are minimum boundaries;
 * a runner may defer an event until its target player is idle and should
 * record the actual completed-match count when it applies the event.
 */
export const SOCIAL_GENERALIZATION_SCENARIOS: readonly SocialGeneralizationScenario[] = [
  fixedScenario("fixed-14-7-7-2c", 7, 7, 2),
  fixedScenario("fixed-14-8-6-2c", 8, 6, 2, true),
  fixedScenario("fixed-14-9-5-2c", 9, 5, 2),
  fixedScenario("fixed-14-10-4-2c", 10, 4, 2, true),

  fixedScenario("balanced-10-5-5-1c", 5, 5, 1),
  fixedScenario("balanced-10-5-5-2c", 5, 5, 2, true),
  fixedScenario("balanced-12-6-6-2c", 6, 6, 2),
  fixedScenario("balanced-16-8-8-2c", 8, 8, 2, true),
  fixedScenario("balanced-18-9-9-3c", 9, 9, 3),

  fixedScenario("edge-14-11-3-2c", 11, 3, 2),
  fixedScenario("edge-8-8-0-2c", 8, 0, 2),
  fixedScenario("edge-6-3-3-1c", 3, 3, 1),

  {
    id: "dynamic-arrival-12-6-6-to-14-after-8",
    initialUpper: 6,
    initialLower: 6,
    courtCount: 2,
    shortHorizonMatches: shortHorizon(14),
    longDiagnostic: true,
    events: [
      {
        type: "join",
        afterCompletedMatches: 8,
        players: [
          { userId: "P13", side: "UPPER" },
          { userId: "P14", side: "LOWER" },
        ],
      },
    ],
  },
  {
    id: "dynamic-feasibility-10-3-to-10-4-after-8",
    initialUpper: 10,
    initialLower: 3,
    courtCount: 2,
    shortHorizonMatches: shortHorizon(14),
    longDiagnostic: false,
    events: [
      {
        type: "join",
        afterCompletedMatches: 8,
        players: [{ userId: "P14", side: "LOWER" }],
      },
    ],
  },
  {
    id: "dynamic-pause-resume-14-7-7-p1-at-6-12",
    initialUpper: 7,
    initialLower: 7,
    courtCount: 2,
    shortHorizonMatches: shortHorizon(14),
    longDiagnostic: true,
    events: [
      { type: "pause", afterCompletedMatches: 6, userId: "P1" },
      { type: "resume", afterCompletedMatches: 12, userId: "P1" },
    ],
  },
  {
    id: "dynamic-played-departure-as-pause-14-10-4-p14-after-8",
    initialUpper: 10,
    initialLower: 4,
    courtCount: 2,
    shortHorizonMatches: shortHorizon(14),
    longDiagnostic: true,
    events: [{ type: "pause", afterCompletedMatches: 8, userId: "P14" }],
  },
  {
    id: "dynamic-pause-resume-14-10-4-p14-at-8-14",
    initialUpper: 10,
    initialLower: 4,
    courtCount: 2,
    shortHorizonMatches: shortHorizon(14),
    longDiagnostic: false,
    events: [
      { type: "pause", afterCompletedMatches: 8, userId: "P14" },
      { type: "resume", afterCompletedMatches: 14, userId: "P14" },
    ],
  },
] as const;

export function getSocialGeneralizationScenario(id: string) {
  const scenario = SOCIAL_GENERALIZATION_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown Social generalization scenario: ${id}`);
  return scenario;
}

/**
 * Materialize the structural roster at a completed-match boundary. Paused
 * players are retained; only explicit join events change this vocabulary.
 */
export function getSocialGeneralizationStructuralRoster(
  scenario: SocialGeneralizationScenario,
  completedMatchCount: number,
): readonly SocialGeneralizationStructuralPlayer[] {
  if (!Number.isInteger(completedMatchCount) || completedMatchCount < 0) {
    throw new RangeError("completedMatchCount must be a non-negative integer");
  }

  const roster = new Map<string, SocialGeneralizationStructuralPlayer>();
  for (let index = 1; index <= scenario.initialUpper; index += 1) {
    const userId = `P${index}`;
    roster.set(userId, { userId, side: "UPPER", isPaused: false });
  }
  for (let index = 1; index <= scenario.initialLower; index += 1) {
    const userId = `P${scenario.initialUpper + index}`;
    roster.set(userId, { userId, side: "LOWER", isPaused: false });
  }

  for (const event of scenario.events) {
    if (event.afterCompletedMatches > completedMatchCount) continue;
    if (event.type === "join") {
      for (const player of event.players) {
        if (roster.has(player.userId)) {
          throw new Error(`Scenario ${scenario.id} joins existing player ${player.userId}`);
        }
        roster.set(player.userId, { ...player, isPaused: false });
      }
      continue;
    }

    const player = roster.get(event.userId);
    if (!player) {
      throw new Error(`Scenario ${scenario.id} references unknown player ${event.userId}`);
    }
    roster.set(event.userId, {
      ...player,
      isPaused: event.type === "pause",
    });
  }

  return [...roster.values()];
}
