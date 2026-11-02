/** Close courts only after compatible writers serve every supported app URL. */
export function courtAvailabilityReady(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL !== "1" || env.COURT_AVAILABILITY_ENABLED === "true";
}
