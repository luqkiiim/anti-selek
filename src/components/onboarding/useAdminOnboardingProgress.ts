"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminOnboardingProgressPayload,
  AdminOnboardingStepId,
} from "@/lib/adminOnboarding";

interface UpdateProgressInput {
  completedStepIds?: AdminOnboardingStepId[];
  dismissed?: boolean;
}

async function readJson(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export function useAdminOnboardingProgress(enabled: boolean) {
  const [progress, setProgress] =
    useState<AdminOnboardingProgressPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProgress = useCallback(async () => {
    if (!enabled) {
      setProgress(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tutorial-progress/admin-onboarding");
      if (!res.ok) {
        setProgress(null);
        return;
      }

      setProgress((await readJson(res)) as AdminOnboardingProgressPayload);
    } catch {
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const updateProgress = useCallback(async (input: UpdateProgressInput) => {
    try {
      const res = await fetch("/api/tutorial-progress/admin-onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return;

      setProgress((await readJson(res)) as AdminOnboardingProgressPayload);
    } catch {
      // Keep the checklist non-blocking if a page test or offline client cannot reach the API.
    }
  }, []);

  const dismiss = useCallback(() => {
    void updateProgress({ dismissed: true });
  }, [updateProgress]);

  const reopen = useCallback(() => {
    void updateProgress({ dismissed: false });
  }, [updateProgress]);

  const completeStep = useCallback(
    (stepId: AdminOnboardingStepId) => {
      if (!progress) return;

      void updateProgress({
        completedStepIds: Array.from(
          new Set([...progress.completedStepIds, stepId])
        ),
      });
    },
    [progress, updateProgress]
  );

  return {
    progress,
    loading,
    dismiss,
    reopen,
    completeStep,
    refresh: loadProgress,
  };
}
