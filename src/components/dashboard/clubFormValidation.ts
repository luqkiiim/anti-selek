import { normalizeNameLookupKey } from "@/lib/quickAccess";
import type { ClubFormError } from "./dashboardTypes";

function validateClubName(clubName: string): ClubFormError | null {
  if (clubName.trim().length < 3) {
    return {
      error: "Club name must be at least 3 characters",
      field: "clubName",
    };
  }

  if (!normalizeNameLookupKey(clubName)) {
    return {
      error: "Club name must include letters or numbers",
      field: "clubName",
    };
  }

  return null;
}

function validateOptionalPassword(password: string): ClubFormError | null {
  if (password.length > 0 && password.length < 4) {
    return {
      error: "Password must be at least 4 characters",
      field: "password",
    };
  }

  return null;
}

export function validateCreateClubInput(
  clubName: string,
  password: string
): ClubFormError | null {
  return validateClubName(clubName) ?? validateOptionalPassword(password);
}

export function validateJoinClubInput(
  clubName: string,
  password: string
): ClubFormError | null {
  return validateClubName(clubName) ?? validateOptionalPassword(password);
}
