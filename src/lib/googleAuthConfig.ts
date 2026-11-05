import "server-only";

export function isGoogleSignInConfigured(): boolean {
  return !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
}

export function isGoogleEnrollmentOpen(): boolean {
  return isGoogleSignInConfigured() && process.env.AUTH_GOOGLE_ENROLLMENT !== "paused";
}
