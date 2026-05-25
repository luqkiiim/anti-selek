export const ADMIN_ONBOARDING_TUTORIAL_KEY = "admin-onboarding";

export const ADMIN_ONBOARDING_STEP_IDS = [
  "admin-community",
  "players",
  "host-session",
  "session-workflow",
  "followups",
] as const;

export type AdminOnboardingStepId = (typeof ADMIN_ONBOARDING_STEP_IDS)[number];

export interface AdminOnboardingStep {
  id: AdminOnboardingStepId;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  completed: boolean;
  autoCompleted: boolean;
  manual: boolean;
}

export interface AdminOnboardingProgressPayload {
  tutorialKey: typeof ADMIN_ONBOARDING_TUTORIAL_KEY;
  visible: boolean;
  dismissed: boolean;
  completedStepIds: AdminOnboardingStepId[];
  primaryCommunityId: string | null;
  steps: AdminOnboardingStep[];
}

export function parseAdminOnboardingStepIds(value: string | null | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isAdminOnboardingStepId);
  } catch {
    return [];
  }
}

export function isAdminOnboardingStepId(
  value: unknown
): value is AdminOnboardingStepId {
  return (
    typeof value === "string" &&
    (ADMIN_ONBOARDING_STEP_IDS as readonly string[]).includes(value)
  );
}

export function normalizeAdminOnboardingStepIds(values: unknown) {
  if (!Array.isArray(values)) return null;

  return Array.from(new Set(values)).filter(isAdminOnboardingStepId);
}

export function buildAdminOnboardingProgress({
  completedStepIds,
  dismissedAt,
  primaryCommunityId,
  hasAdminCommunity,
  hasRosterPlayers,
  hasAnySession,
  hasRosteredSession,
}: {
  completedStepIds: AdminOnboardingStepId[];
  dismissedAt: Date | string | null;
  primaryCommunityId: string | null;
  hasAdminCommunity: boolean;
  hasRosterPlayers: boolean;
  hasAnySession: boolean;
  hasRosteredSession: boolean;
}): AdminOnboardingProgressPayload {
  const manualCompletions = new Set(completedStepIds);
  const communityHref = primaryCommunityId ? `/community/${primaryCommunityId}` : "/";
  const adminHref = primaryCommunityId
    ? `/community/${primaryCommunityId}/admin`
    : "/";
  const hostHref = primaryCommunityId
    ? `/community/${primaryCommunityId}?tab=host`
    : "/";
  const inferredCompletions: Record<AdminOnboardingStepId, boolean> = {
    "admin-community": hasAdminCommunity,
    players: hasRosterPlayers,
    "host-session": hasAnySession,
    "session-workflow": hasRosteredSession,
    followups: false,
  };

  const stepDefinitions: Array<
    Omit<AdminOnboardingStep, "completed" | "autoCompleted">
  > = [
    {
      id: "admin-community",
      title: "Open your community",
      detail: "Use an admin community as the home base for players and tournaments.",
      actionLabel: primaryCommunityId ? "Open" : "Create",
      href: communityHref,
      manual: false,
    },
    {
      id: "players",
      title: "Build the roster",
      detail: "Add players, review placeholders, and keep community profiles tidy.",
      actionLabel: "Players",
      href: adminHref,
      manual: false,
    },
    {
      id: "host-session",
      title: "Create a test tournament",
      detail: "Try the Host flow with safe settings before a real court night.",
      actionLabel: "Host",
      href: hostHref,
      manual: false,
    },
    {
      id: "session-workflow",
      title: "Run the session flow",
      detail: "Choose the roster, create courts, and get familiar with match scoring.",
      actionLabel: "Host",
      href: hostHref,
      manual: false,
    },
    {
      id: "followups",
      title: "Review admin follow-ups",
      detail: "Know where claims, linked identities, and community settings live.",
      actionLabel: "Admin",
      href: adminHref,
      manual: true,
    },
  ];

  return {
    tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
    visible: hasAdminCommunity,
    dismissed: dismissedAt !== null,
    completedStepIds: ADMIN_ONBOARDING_STEP_IDS.filter(
      (id) => inferredCompletions[id] || manualCompletions.has(id)
    ),
    primaryCommunityId,
    steps: stepDefinitions.map((step) => {
      const autoCompleted = inferredCompletions[step.id];

      return {
        ...step,
        autoCompleted,
        completed: autoCompleted || manualCompletions.has(step.id),
      };
    }),
  };
}
