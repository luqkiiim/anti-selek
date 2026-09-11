// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  getAdjacentSwipeIndex,
  getHorizontalSwipeDirection,
  isSwipeProtectedTarget,
} from "./gesture";

describe("prototype horizontal swipe guards", () => {
  it("recognizes horizontal movement after the threshold", () => {
    expect(getHorizontalSwipeDirection(100, 20, 40, 24)).toBe("left");
    expect(getHorizontalSwipeDirection(40, 20, 100, 24)).toBe("right");
  });

  it("rejects short and primarily vertical movement", () => {
    expect(getHorizontalSwipeDirection(100, 20, 70, 22)).toBeNull();
    expect(getHorizontalSwipeDirection(100, 20, 35, 75)).toBeNull();
  });

  it("protects form controls and dialog content", () => {
    const input = document.createElement("input");
    const dialog = document.createElement("dialog");
    const dialogButton = document.createElement("button");
    dialog.append(dialogButton);

    expect(isSwipeProtectedTarget(input)).toBe(true);
    expect(isSwipeProtectedTarget(dialogButton)).toBe(true);
    expect(isSwipeProtectedTarget(document.createElement("button"))).toBe(
      false,
    );
  });

  it("keeps swipes within the tab range", () => {
    expect(getAdjacentSwipeIndex(0, 3, "right")).toBeNull();
    expect(getAdjacentSwipeIndex(2, 3, "left")).toBeNull();
    expect(getAdjacentSwipeIndex(1, 3, "left")).toBe(2);
  });
});
