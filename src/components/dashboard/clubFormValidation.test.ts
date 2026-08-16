import { describe, expect, it } from "vitest";

import {
  validateCreateClubInput,
  validateJoinClubInput,
} from "./clubFormValidation";

describe("dashboard club form validation", () => {
  it("requires a meaningful club name", () => {
    expect(validateCreateClubInput("ab", "")).toEqual({
      error: "Club name must be at least 3 characters",
      field: "clubName",
    });
    expect(validateCreateClubInput("---", "")).toEqual({
      error: "Club name must include letters or numbers",
      field: "clubName",
    });
  });

  it("allows an empty password and validates a supplied password", () => {
    expect(validateCreateClubInput("Net Players", "")).toBeNull();
    expect(validateCreateClubInput("Net Players", "123")).toEqual({
      error: "Password must be at least 4 characters",
      field: "password",
    });
    expect(validateCreateClubInput("Net Players", "1234")).toBeNull();
  });

  it("applies the same discoverable rules before joining", () => {
    expect(validateJoinClubInput(" ", "")).toEqual({
      error: "Club name must be at least 3 characters",
      field: "clubName",
    });
    expect(validateJoinClubInput("Net Players", "1234")).toBeNull();
  });
});
