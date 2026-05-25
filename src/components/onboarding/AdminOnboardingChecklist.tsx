"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Sparkles, X } from "lucide-react";
import type {
  AdminOnboardingProgressPayload,
  AdminOnboardingStepId,
} from "@/lib/adminOnboarding";

interface AdminOnboardingChecklistProps {
  progress: AdminOnboardingProgressPayload | null;
  loading?: boolean;
  onDismiss: () => void;
  onReopen: () => void;
  onCompleteStep: (stepId: AdminOnboardingStepId) => void;
}

export function AdminOnboardingChecklist({
  progress,
  loading = false,
  onDismiss,
  onReopen,
  onCompleteStep,
}: AdminOnboardingChecklistProps) {
  if (loading || !progress?.visible) {
    return null;
  }

  if (progress.dismissed) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReopen}
          className="app-button-secondary px-3 py-2 text-sm"
        >
          <Sparkles aria-hidden="true" size={16} />
          Getting started
        </button>
      </div>
    );
  }

  const completedCount = progress.steps.filter((step) => step.completed).length;

  return (
    <section className="app-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
              <Sparkles aria-hidden="true" size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Getting started
              </p>
              <p className="text-xs font-semibold text-gray-500">
                {completedCount}/{progress.steps.length} admin steps
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss admin onboarding"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-900"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {progress.steps.map((step) => {
          const Icon = step.completed ? CheckCircle2 : Circle;

          return (
            <div
              key={step.id}
              className={`grid gap-3 rounded-xl border px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center ${
                step.completed
                  ? "border-teal-100 bg-teal-50/50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex min-w-0 gap-3">
                <Icon
                  aria-hidden="true"
                  size={18}
                  className={step.completed ? "mt-0.5 shrink-0 text-teal-700" : "mt-0.5 shrink-0 text-gray-400"}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    {step.detail}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                {!step.completed && step.manual ? (
                  <button
                    type="button"
                    onClick={() => onCompleteStep(step.id)}
                    className="app-button-secondary px-3 py-2 text-xs"
                  >
                    Mark reviewed
                  </button>
                ) : null}
                <Link
                  href={step.href}
                  className="app-button-secondary px-3 py-2 text-xs"
                >
                  {step.actionLabel}
                  <ChevronRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
