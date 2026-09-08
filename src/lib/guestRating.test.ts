import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { guestRatingFromMatches, getGuestRating } from "./guestRating";
const match = { team1User1Id: 'guest-one', team1User2Id: 'a', team2User1Id: 'b', team2User2Id: 'c', team1EloChange: 12, team2EloChange: -12 };
describe('earned guest ratings', () => {
  it('adds wins and losses to the assigned starting rating', () => {
    expect(guestRatingFromMatches('guest-one', 1100, [match, { ...match, team1EloChange: -7 }])).toBe(1105);
    expect(guestRatingFromMatches('b', 1000, [match])).toBe(988);
  });
  it('does not combine separate identities with the same name', () => {
    expect(guestRatingFromMatches('guest-two', 1000, [match])).toBe(1000);
  });
  it('reflects corrected or removed results without accumulating twice', () => {
    expect(guestRatingFromMatches('guest-one', 1100, [{ ...match, team1EloChange: -12 }])).toBe(1088);
    expect(guestRatingFromMatches('guest-one', 1100, [])).toBe(1100);
    expect(guestRatingFromMatches('guest-one', 1100, [match])).toBe(1112);
    expect(guestRatingFromMatches('guest-one', 1100, [match])).toBe(1112);
  });
  it('ignores unavailable rating changes', () => {
    expect(guestRatingFromMatches('guest-one', 1000, [{ ...match, team1EloChange: null }])).toBe(1000);
  });
  it('loads only completed real guest games belonging to this identity', async () => {
    const findMany = vi.fn(async () => [match]);
    const tx = { match: { findMany } } as unknown as Prisma.TransactionClient;
    expect(await getGuestRating(tx, 'guest-one', 1000)).toBe(1012);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED', session: { isTest: false, players: { some: { userId: 'guest-one', isGuest: true } } } }) }));
  });
});
