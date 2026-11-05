// A Google-only account has no credential bcrypt could ever accept. Keep the
// existing NOT NULL column compatible with deployments that predate Google sign-in.
export const GOOGLE_ONLY_PASSWORD = "!google-only";

export function hasAccountPassword(passwordHash: string | null | undefined): boolean {
  return !!passwordHash && passwordHash !== GOOGLE_ONLY_PASSWORD;
}
