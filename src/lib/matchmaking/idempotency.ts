/**
 * Helper to simulate the updateMany gating logic used in routes.
 * This is for unit testing the logic independently of the DB.
 */
export function canTransitionStatus(
  currentStatus: string,
  requiredStatus: string
): boolean {
  return currentStatus === requiredStatus;
}

/**
 * Simulates the transaction gating logic.
 */
export function simulateGatedUpdate(
  match: { id: string; status: string },
  requiredStatus: string,
  newStatus: string
) {
  if (match.status !== requiredStatus) {
    return { count: 0 };
  }
  return { count: 1, updatedMatch: { ...match, status: newStatus } };
}
