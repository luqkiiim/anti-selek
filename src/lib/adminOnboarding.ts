export const ADMIN_ONBOARDING_TUTORIAL_KEY = "admin-onboarding";

export const ADMIN_ONBOARDING_STEP_IDS = [
  "admin-community",
  "players",
  "host-session",
  "session-workflow",
  "score-match",
  "end-session",
  "reset-cleanup",
] as const;

export type AdminOnboardingStepId = (typeof ADMIN_ONBOARDING_STEP_IDS)[number];

export interface AdminOnboardingStep {
  id: AdminOnboardingStepId;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  targetId: string;
  coachmark: string;
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
  primarySessionCode: string | null;
  steps: AdminOnboardingStep[];
}

export interface AdminOnboardingStepOverride {
  stepId: AdminOnboardingStepId;
  targetId?: string;
  coachmark?: string;
  href?: string;
  actionLabel?: string;
}

export function getHostSessionOnboardingOverride({
  newSessionName,
  selectedPlayerCount,
  guestCount,
}: {
  newSessionName: string;
  selectedPlayerCount: number;
  guestCount: number;
}): AdminOnboardingStepOverride {
  if (!newSessionName.trim()) {
    return {
      stepId: "host-session",
      targetId: "admin-onboarding-session-name",
      coachmark: "First, type a simple tournament name so the create button can unlock.",
      actionLabel: "Name it",
    };
  }

  if (selectedPlayerCount + guestCount === 0) {
    return {
      stepId: "host-session",
      targetId: "admin-onboarding-host-players",
      coachmark: "Next, press Choose and select the players for this test tournament.",
      actionLabel: "Choose players",
    };
  }

  return {
    stepId: "host-session",
    targetId: "admin-onboarding-create-session",
    coachmark: "Now the setup is ready. Press Create Test Session to open the live session.",
    actionLabel: "Create",
  };
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
  hasScoredMatch,
  hasCompletedSession,
  primarySessionCode,
}: {
  completedStepIds: AdminOnboardingStepId[];
  dismissedAt: Date | string | null;
  primaryCommunityId: string | null;
  primarySessionCode: string | null;
  hasAdminCommunity: boolean;
  hasRosterPlayers: boolean;
  hasAnySession: boolean;
  hasRosteredSession: boolean;
  hasScoredMatch: boolean;
  hasCompletedSession: boolean;
}): AdminOnboardingProgressPayload {
  const manualCompletions = new Set(completedStepIds);
  const communityHref = primaryCommunityId ? `/community/${primaryCommunityId}` : "/";
  const adminPlayersHref = primaryCommunityId
    ? `/community/${primaryCommunityId}/admin?tab=players`
    : "/";
  const adminSettingsHref = primaryCommunityId
    ? `/community/${primaryCommunityId}/admin?tab=settings`
    : "/";
  const hostHref = primaryCommunityId
    ? `/community/${primaryCommunityId}?tab=host`
    : "/";
  const sessionHref = primarySessionCode
    ? `/session/${primarySessionCode}`
    : hostHref;
  const inferredCompletions: Record<AdminOnboardingStepId, boolean> = {
    "admin-community": hasAdminCommunity,
    players: hasRosterPlayers,
    "host-session": hasAnySession,
    "session-workflow": hasRosteredSession,
    "score-match": hasScoredMatch,
    "end-session": hasCompletedSession,
    "reset-cleanup": false,
  };

  const stepDefinitions: Array<
    Omit<AdminOnboardingStep, "completed" | "autoCompleted">
  > = [
    {
      id: "admin-community",
      title: "Open your community",
      detail: "Start from an admin community so the tutorial can use real controls.",
      actionLabel: primaryCommunityId ? "Open" : "Create",
      href: communityHref,
      targetId: primaryCommunityId
        ? "admin-onboarding-dashboard-community"
        : "admin-onboarding-create-community",
      coachmark: primaryCommunityId
        ? "Open your admin community to continue the setup flow."
        : "Press Create Community to make your admin workspace.",
      manual: false,
    },
    {
      id: "players",
      title: "Create players",
      detail: "Go to the admin roster and add the first player profiles.",
      actionLabel: "Players",
      href: adminPlayersHref,
      targetId: "admin-onboarding-add-player",
      coachmark: "Press Add player to create roster profiles for the session.",
      manual: false,
    },
    {
      id: "host-session",
      title: "Create a test tournament",
      detail: "Try the Host flow with safe settings before a real court night.",
      actionLabel: "Host",
      href: hostHref,
      targetId: "admin-onboarding-create-session",
      coachmark: "Name the tournament, keep it as a test if you want rehearsal mode, then create it.",
      manual: false,
    },
    {
      id: "session-workflow",
      title: "Run the session flow",
      detail: "Choose the roster, create courts, and get familiar with match scoring.",
      actionLabel: primarySessionCode ? "Open session" : "Host",
      href: sessionHref,
      targetId: primarySessionCode
        ? "admin-onboarding-start-session"
        : "admin-onboarding-host-players",
      coachmark: primarySessionCode
        ? "Start the session and create the first court match."
        : "Press Choose to select players for the tournament.",
      manual: false,
    },
    {
      id: "score-match",
      title: "Input a score",
      detail: "Enter both team scores and submit the result from a live match.",
      actionLabel: "Open session",
      href: sessionHref,
      targetId: "admin-onboarding-score-input",
      coachmark: "Create a live court match if needed, then type both team scores and press Submit Score.",
      manual: false,
    },
    {
      id: "end-session",
      title: "End the session",
      detail: "Close the test session once scoring is done to see final standings.",
      actionLabel: "Open session",
      href: sessionHref,
      targetId: "admin-onboarding-end-session",
      coachmark: "Open session settings and press End Session when rehearsal is complete.",
      manual: false,
    },
    {
      id: "reset-cleanup",
      title: "Optional cleanup",
      detail: "Return to settings and review Reset community if this was only a test setup.",
      actionLabel: "Settings",
      href: adminSettingsHref,
      targetId: "admin-onboarding-reset-community",
      coachmark: "This reset is optional. Use it only when you want to clear test history and ratings.",
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
    primarySessionCode,
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
