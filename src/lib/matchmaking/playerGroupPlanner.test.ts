import { describe, expect, it } from "vitest";
import {
  CourtGroupType,
  SessionCrossoverFrequency,
  SessionPool,
} from "@/types/enums";
import {
  buildPlayerGroupCourtPlans,
  getPlayerGroupSelectionConstraints,
} from "./playerGroupPlanner";

function countTypes(types: CourtGroupType[], type: CourtGroupType) {
  return types.filter((candidate) => candidate === type).length;
}

describe("player-group court composition planner", () => {
  it.each([
    [SessionCrossoverFrequency.OCCASIONAL, 21, 4],
    [SessionCrossoverFrequency.OCCASIONAL, 24, 4],
    [SessionCrossoverFrequency.BALANCED, 21, 7],
    [SessionCrossoverFrequency.BALANCED, 24, 8],
    [SessionCrossoverFrequency.FREQUENT, 21, 10],
    [SessionCrossoverFrequency.FREQUENT, 24, 12],
  ])(
    "tracks %s crossover debt across %i asynchronous assignments",
    (crossoverFrequency, assignmentCount, expectedCrossovers) => {
      const history: Array<{
        courtGroupType: CourtGroupType;
        poolASeatCount: number;
        poolBSeatCount: number;
      }> = [];

      for (let assignment = 0; assignment < assignmentCount; assignment += 1) {
        const [plan] = buildPlayerGroupCourtPlans({
          requestedCourtCount: 1,
          activePoolAPlayerCount: 7,
          activePoolBPlayerCount: 7,
          waitingPoolAPlayerCount: 7,
          waitingPoolBPlayerCount: 7,
          history,
          crossoverFrequency,
        });
        history.push(plan.compositions[0]);
      }

      expect(
        history.filter(
          (court) => court.courtGroupType === CourtGroupType.CROSSOVER
        )
      ).toHaveLength(expectedCrossovers);
    }
  );

  it("carries missed crossover debt until a legal 2/2 court is feasible", () => {
    const history = [
      {
        courtGroupType: CourtGroupType.COMPETITIVE,
        poolASeatCount: 4,
        poolBSeatCount: 0,
      },
      {
        courtGroupType: CourtGroupType.SOCIAL,
        poolASeatCount: 0,
        poolBSeatCount: 4,
      },
    ];
    const [missedPlan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 1,
      activePoolAPlayerCount: 7,
      activePoolBPlayerCount: 7,
      waitingPoolAPlayerCount: 7,
      waitingPoolBPlayerCount: 1,
      history,
      crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    });
    history.push(missedPlan.compositions[0]);

    const [recoveryPlan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 1,
      activePoolAPlayerCount: 7,
      activePoolBPlayerCount: 7,
      waitingPoolAPlayerCount: 7,
      waitingPoolBPlayerCount: 7,
      history,
      crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    });

    expect(missedPlan.compositions[0].courtGroupType).toBe(
      CourtGroupType.COMPETITIVE
    );
    expect(recoveryPlan.compositions[0].courtGroupType).toBe(
      CourtGroupType.CROSSOVER
    );
  });

  it("includes earlier courts in a Frequent batch target", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 2,
      activePoolAPlayerCount: 7,
      activePoolBPlayerCount: 7,
      waitingPoolAPlayerCount: 7,
      waitingPoolBPlayerCount: 7,
      crossoverFrequency: SessionCrossoverFrequency.FREQUENT,
    });

    expect(plan.crossoverCourtCount).toBe(1);
  });

  it("allocates one Competitive, one Social, and one Crossover court for 12/9", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 3,
      activePoolAPlayerCount: 12,
      activePoolBPlayerCount: 9,
      waitingPoolAPlayerCount: 12,
      waitingPoolBPlayerCount: 9,
    });
    const types = plan.compositions.map((court) => court.courtGroupType);

    expect(countTypes(types, CourtGroupType.COMPETITIVE)).toBe(1);
    expect(countTypes(types, CourtGroupType.SOCIAL)).toBe(1);
    expect(countTypes(types, CourtGroupType.CROSSOVER)).toBe(1);
    expect(plan.compositions.reduce((sum, court) => sum + court.poolASeatCount, 0)).toBe(6);
    expect(plan.compositions.reduce((sum, court) => sum + court.poolBSeatCount, 0)).toBe(6);
    expect(plan.overflowCourtCount).toBe(0);
  });

  it("keeps one deliberate Crossover while correcting cumulative 12/9 allocation", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 3,
      activePoolAPlayerCount: 12,
      activePoolBPlayerCount: 9,
      waitingPoolAPlayerCount: 12,
      waitingPoolBPlayerCount: 9,
      history: [
        {
          courtGroupType: CourtGroupType.COMPETITIVE,
          poolASeatCount: 4,
          poolBSeatCount: 0,
        },
        {
          courtGroupType: CourtGroupType.SOCIAL,
          poolASeatCount: 0,
          poolBSeatCount: 4,
        },
        {
          courtGroupType: CourtGroupType.CROSSOVER,
          poolASeatCount: 2,
          poolBSeatCount: 2,
        },
      ],
    });
    const types = plan.compositions.map((court) => court.courtGroupType);

    expect(countTypes(types, CourtGroupType.COMPETITIVE)).toBe(1);
    expect(countTypes(types, CourtGroupType.SOCIAL)).toBe(1);
    expect(countTypes(types, CourtGroupType.CROSSOVER)).toBe(1);
    expect(plan.compositions.reduce((sum, court) => sum + court.poolASeatCount, 0)).toBe(6);
    expect(plan.compositions.reduce((sum, court) => sum + court.poolBSeatCount, 0)).toBe(6);
    expect(plan.projectedCompetitiveSeatShare).toBeCloseTo(12 / 24);
  });

  it("uses dedicated lanes for the first two single-court assignments, then crosses over", () => {
    const history: Array<{
      courtGroupType: CourtGroupType;
      poolASeatCount: number;
      poolBSeatCount: number;
    }> = [];

    for (let assignment = 0; assignment < 3; assignment += 1) {
      const [plan] = buildPlayerGroupCourtPlans({
        requestedCourtCount: 1,
        activePoolAPlayerCount: 12,
        activePoolBPlayerCount: 9,
        waitingPoolAPlayerCount: 12,
        waitingPoolBPlayerCount: 9,
        history,
      });
      history.push(plan.compositions[0]);
    }

    expect(history.map((court) => court.courtGroupType)).toEqual([
      CourtGroupType.COMPETITIVE,
      CourtGroupType.SOCIAL,
      CourtGroupType.CROSSOVER,
    ]);
  });

  it("uses a feasible Crossover to closely track an 18/3 active ratio", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 3,
      activePoolAPlayerCount: 18,
      activePoolBPlayerCount: 3,
      waitingPoolAPlayerCount: 18,
      waitingPoolBPlayerCount: 3,
    });
    const types = plan.compositions.map((court) => court.courtGroupType);

    expect(countTypes(types, CourtGroupType.COMPETITIVE)).toBe(2);
    expect(countTypes(types, CourtGroupType.CROSSOVER)).toBe(1);
    expect(plan.overflowCourtCount).toBe(0);
  });

  it("uses Open Overflow only when strict compositions cannot fill 3/9", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 3,
      activePoolAPlayerCount: 3,
      activePoolBPlayerCount: 9,
      waitingPoolAPlayerCount: 3,
      waitingPoolBPlayerCount: 9,
    });
    const overflow = plan.compositions.find(
      (court) => court.courtGroupType === CourtGroupType.OPEN_OVERFLOW
    );

    expect(plan.filledCourtCount).toBe(3);
    expect(plan.overflowCourtCount).toBe(1);
    expect(overflow).toMatchObject({ poolASeatCount: 1, poolBSeatCount: 3 });
    expect(
      plan.compositions.some(
        (court) => court.courtGroupType === CourtGroupType.CROSSOVER
      )
    ).toBe(true);
  });

  it("puts a Crossover next when the previous two assignments were dedicated", () => {
    const [plan] = buildPlayerGroupCourtPlans({
      requestedCourtCount: 1,
      activePoolAPlayerCount: 4,
      activePoolBPlayerCount: 4,
      waitingPoolAPlayerCount: 4,
      waitingPoolBPlayerCount: 4,
      history: [
        {
          courtGroupType: CourtGroupType.COMPETITIVE,
          poolASeatCount: 4,
          poolBSeatCount: 0,
        },
        {
          courtGroupType: CourtGroupType.SOCIAL,
          poolASeatCount: 0,
          poolBSeatCount: 4,
        },
      ],
    });

    expect(plan.compositions[0].courtGroupType).toBe(
      CourtGroupType.CROSSOVER
    );
    expect(plan.cadenceViolationCount).toBe(0);
  });

  it("prefers a full strict plan over an equally full overflow plan", () => {
    const plans = buildPlayerGroupCourtPlans({
      requestedCourtCount: 2,
      activePoolAPlayerCount: 8,
      activePoolBPlayerCount: 8,
      waitingPoolAPlayerCount: 8,
      waitingPoolBPlayerCount: 8,
    });

    expect(plans[0].filledCourtCount).toBe(2);
    expect(plans[0].overflowCourtCount).toBe(0);
    expect(plans.find((plan) => plan.overflowCourtCount > 0)).toBeDefined();
  });

  it.each([
    {
      label: "balanced 8/8",
      activeA: 8,
      activeB: 8,
      waitingA: 8,
      waitingB: 8,
      requested: 2,
      expected: {
        competitive: 1,
        social: 1,
        crossover: 0,
        overflow: 0,
      },
    },
    {
      label: "inverse 9/12",
      activeA: 9,
      activeB: 12,
      waitingA: 9,
      waitingB: 12,
      requested: 3,
      expected: {
        competitive: 1,
        social: 1,
        crossover: 1,
        overflow: 0,
      },
    },
    {
      label: "Competitive group absent",
      activeA: 0,
      activeB: 8,
      waitingA: 0,
      waitingB: 8,
      requested: 2,
      expected: {
        competitive: 0,
        social: 2,
        crossover: 0,
        overflow: 0,
      },
    },
    {
      label: "only one Competitive player",
      activeA: 1,
      activeB: 7,
      waitingA: 1,
      waitingB: 7,
      requested: 2,
      expected: {
        competitive: 0,
        social: 1,
        crossover: 0,
        overflow: 1,
      },
    },
    {
      label: "2/19 extreme ratio",
      activeA: 2,
      activeB: 19,
      waitingA: 2,
      waitingB: 19,
      requested: 3,
      expected: {
        competitive: 0,
        social: 2,
        crossover: 1,
        overflow: 0,
      },
    },
    {
      label: "paused players excluded while waiting players remain feasible",
      activeA: 2,
      activeB: 6,
      waitingA: 2,
      waitingB: 6,
      requested: 2,
      expected: {
        competitive: 0,
        social: 1,
        crossover: 1,
        overflow: 0,
      },
    },
  ])(
    "handles $label",
    ({ activeA, activeB, waitingA, waitingB, requested, expected }) => {
      const [plan] = buildPlayerGroupCourtPlans({
        requestedCourtCount: requested,
        activePoolAPlayerCount: activeA,
        activePoolBPlayerCount: activeB,
        waitingPoolAPlayerCount: waitingA,
        waitingPoolBPlayerCount: waitingB,
      });
      const types = plan.compositions.map((court) => court.courtGroupType);

      expect(plan.filledCourtCount).toBe(requested);
      expect(countTypes(types, CourtGroupType.COMPETITIVE)).toBe(
        expected.competitive
      );
      expect(countTypes(types, CourtGroupType.SOCIAL)).toBe(expected.social);
      expect(countTypes(types, CourtGroupType.CROSSOVER)).toBe(
        expected.crossover
      );
      expect(countTypes(types, CourtGroupType.OPEN_OVERFLOW)).toBe(
        expected.overflow
      );
    }
  );

  it.each([1, 2, 3])(
    "fills all of %i requested courts when 12/9 can support them",
    (requestedCourtCount) => {
      const [plan] = buildPlayerGroupCourtPlans({
        requestedCourtCount,
        activePoolAPlayerCount: 12,
        activePoolBPlayerCount: 9,
        waitingPoolAPlayerCount: 12,
        waitingPoolBPlayerCount: 9,
      });

      expect(plan.filledCourtCount).toBe(requestedCourtCount);
      expect(
        plan.compositions.reduce(
          (seatCount, composition) =>
            seatCount + composition.poolASeatCount + composition.poolBSeatCount,
          0
        )
      ).toBe(requestedCourtCount * 4);
    }
  );

  it("returns lower-count fallbacks after the maximum feasible court plan", () => {
    const plans = buildPlayerGroupCourtPlans({
      requestedCourtCount: 3,
      activePoolAPlayerCount: 4,
      activePoolBPlayerCount: 4,
      waitingPoolAPlayerCount: 4,
      waitingPoolBPlayerCount: 4,
    });

    expect(plans[0].filledCourtCount).toBe(2);
    expect(plans.some((plan) => plan.filledCourtCount === 1)).toBe(true);
    expect(plans.every((plan) => plan.filledCourtCount <= 2)).toBe(true);
  });
});

describe("player-group selection constraints", () => {
  const players = [
    { userId: "A1", pool: SessionPool.A },
    { userId: "A2", pool: SessionPool.A },
    { userId: "B1", pool: SessionPool.B },
    { userId: "B2", pool: SessionPool.B },
  ] as const;
  const playersById = new Map(players.map((player) => [player.userId, player]));

  it("allows only one Competitive and one Social player on each Crossover team", () => {
    const constraints = getPlayerGroupSelectionConstraints({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });

    expect(constraints.isQuartetAllowed([...players])).toBe(true);
    expect(
      constraints.normalizePartition({
        partition: { team1: ["A1", "B1"], team2: ["A2", "B2"] },
        players: [...players],
        playersById,
      })
    ).not.toBeNull();
    expect(
      constraints.normalizePartition({
        partition: { team1: ["A1", "A2"], team2: ["B1", "B2"] },
        players: [...players],
        playersById,
      })
    ).toBeNull();
  });

  it("keeps a 2/2 Open Overflow court from being mislabeled Crossover", () => {
    const constraints = getPlayerGroupSelectionConstraints({
      courtGroupType: CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });

    expect(
      constraints.normalizePartition({
        partition: { team1: ["A1", "A2"], team2: ["B1", "B2"] },
        players: [...players],
        playersById,
      })
    ).not.toBeNull();
    expect(
      constraints.normalizePartition({
        partition: { team1: ["A1", "B1"], team2: ["A2", "B2"] },
        players: [...players],
        playersById,
      })
    ).toBeNull();
  });
});
