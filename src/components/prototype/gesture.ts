export type SwipeDirection = "left" | "right";

export const DEFAULT_SWIPE_THRESHOLD = 48;

export function getHorizontalSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = DEFAULT_SWIPE_THRESHOLD,
): SwipeDirection | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const horizontalDistance = Math.abs(deltaX);

  if (
    horizontalDistance < threshold ||
    horizontalDistance <= Math.abs(deltaY) * 1.25
  ) {
    return null;
  }

  return deltaX < 0 ? "left" : "right";
}

export function isSwipeProtectedTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], [data-swipe-ignore]',
    ),
  );
}

export function getAdjacentSwipeIndex(
  currentIndex: number,
  itemCount: number,
  direction: SwipeDirection,
): number | null {
  const nextIndex = currentIndex + (direction === "left" ? 1 : -1);
  return nextIndex >= 0 && nextIndex < itemCount ? nextIndex : null;
}
