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
      actionLabel: "Name tournament",
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
    actionLabel: "Create test session",
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
  hasScoredMatch,
  hasCompletedSession,
  primarySessionCode,
}: {
  completedStepIds: AdminOnboardingStepId[];
  dismissedAt: Date | string | null;
  primaryCommunityId: string | null;
  primarySessionCode: string | null;
  hasAdminCommunity: boolean;
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
    players: false,
    "host-session": false,
    "session-workflow": false,
    "score-match": hasScoredMatch,
    "end-session": hasCompletedSession,
    "reset-cleanup": false,
  };

  const stepDefinitions: Array<
    Omit<AdminOnboardingStep, "completed" | "autoCompleted">
  > = [
    {
      id: "admin-community",
      title: "Open playground",
      detail: "Start in your private tutorial club so practice data stays separate.",
      actionLabel: primaryCommunityId
        ? "Open tutorial playground"
        : "Open tutorial playground",
      href: communityHref,
      targetId: primaryCommunityId
        ? "admin-onboarding-dashboard-community"
        : "admin-onboarding-create-community",
      coachmark: primaryCommunityId
        ? "Open your tutorial playground to practice the admin flow."
        : "Open the tutorial playground to create a safe practice club.",
      manual: false,
    },
    {
      id: "players",
      title: "Review practice players",
      detail: "Open the prefilled roster and scan the 13 practice players.",
      actionLabel: "Open players",
      href: adminPlayersHref,
      targetId: "admin-onboarding-players-tab",
      coachmark: "Open Players to review the short practice roster before hosting.",
      manual: false,
    },
    {
      id: "host-session",
      title: "Create a test tournament",
      detail: "Use the Host flow to create your own test tournament inside the playground.",
      actionLabel: "Open host setup",
      href: hostHref,
      targetId: "admin-onboarding-create-session",
      coachmark: "Name a practice tournament, keep it as a test session, then create it.",
      manual: false,
    },
    {
      id: "session-workflow",
      title: "Explore a live practice session",
      detail: "Open a live playground session and get familiar with the session controls.",
      actionLabel: primarySessionCode ? "Open live session" : "Open host setup",
      href: sessionHref,
      targetId: primarySessionCode
        ? "admin-onboarding-session-panel"
        : "admin-onboarding-host-players",
      coachmark: primarySessionCode
        ? "Review the live practice session, player count, active courts, and settings."
        : "Press Choose to select players for the tournament.",
      manual: false,
    },
    {
      id: "score-match",
      title: "Score a practice match",
      detail: "Enter both team scores and submit a result from a live practice court.",
      actionLabel: "Open scoring",
      href: sessionHref,
      targetId: "admin-onboarding-score-input",
      coachmark: "Use a live practice court to type both team scores and submit the score.",
      manual: false,
    },
    {
      id: "end-session",
      title: "End the test session",
      detail: "Close the practice session once scoring is done to see final standings.",
      actionLabel: "Open session settings",
      href: sessionHref,
      targetId: "admin-onboarding-end-session",
      coachmark: "Open session settings and press End Session when practice is complete.",
      manual: false,
    },
    {
      id: "reset-cleanup",
      title: "Reset playground",
      detail: "Restore the playground to the original players, courts, matches, and progress.",
      actionLabel: "Reset playground",
      href: adminSettingsHref,
      targetId: "admin-onboarding-reset-community",
      coachmark: "Reset the playground whenever you want a fresh practice run.",
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
