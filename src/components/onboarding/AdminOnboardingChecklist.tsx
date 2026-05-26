"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AdminOnboardingProgressPayload,
  AdminOnboardingStep,
  AdminOnboardingStepOverride,
  AdminOnboardingStepId,
} from "@/lib/adminOnboarding";

interface AdminOnboardingChecklistProps {
  progress: AdminOnboardingProgressPayload | null;
  loading?: boolean;
  onDismiss: () => void;
  onReopen: () => void;
  onCompleteStep: (stepId: AdminOnboardingStepId) => void;
  activeStepOverride?: AdminOnboardingStepOverride | null;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_MARGIN = 12;
const COACHMARK_MARGIN = 16;
const COACHMARK_WIDTH = 320;
const COACHMARK_MAX_HEIGHT = 220;
const COACHMARK_GAP = 14;
const SCROLL_SETTLE_MS = 360;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function AdminOnboardingSpotlight({
  step,
  onCompleteStep,
}: {
  step: AdminOnboardingStep;
  onCompleteStep: (stepId: AdminOnboardingStepId) => void;
}) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [targetFound, setTargetFound] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;
    let scrollSettleTimeoutId: number | null = null;
    const selector = `[data-tutorial-target="${step.targetId}"]`;

    const updateRect = (shouldScroll = false) => {
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) {
        setTargetFound(false);
        setRect(null);
        return;
      }

      setTargetFound(true);
      if (shouldScroll) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }

      const bounds = target.getBoundingClientRect();
      setRect({
        top: Math.max(SPOTLIGHT_MARGIN, bounds.top - 8),
        left: Math.max(SPOTLIGHT_MARGIN, bounds.left - 8),
        width: bounds.width + 16,
        height: bounds.height + 16,
      });
    };

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      updateRect(true);
      scrollSettleTimeoutId = window.setTimeout(() => {
        scrollSettleTimeoutId = null;
        updateRect(false);
      }, SCROLL_SETTLE_MS);
    });

    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateRect(false);
      });
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (scrollSettleTimeoutId !== null) {
        window.clearTimeout(scrollSettleTimeoutId);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [step.targetId]);

  const coachmarkStyle = useMemo(() => {
    if (!rect) return undefined;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxLeft = Math.max(
      COACHMARK_MARGIN,
      viewportWidth - COACHMARK_WIDTH - COACHMARK_MARGIN
    );
    const maxTop = Math.max(
      COACHMARK_MARGIN,
      viewportHeight - COACHMARK_MAX_HEIGHT - COACHMARK_MARGIN
    );
    const hasRoomBelow =
      rect.top + rect.height + COACHMARK_GAP + COACHMARK_MAX_HEIGHT <=
      viewportHeight - COACHMARK_MARGIN;
    const preferredTop = hasRoomBelow
      ? rect.top + rect.height + COACHMARK_GAP
      : rect.top - COACHMARK_MAX_HEIGHT - COACHMARK_GAP;
    const top = clamp(preferredTop, COACHMARK_MARGIN, maxTop);
    const left = clamp(
      rect.left + rect.width / 2 - COACHMARK_WIDTH / 2,
      COACHMARK_MARGIN,
      maxLeft
    );

    return {
      top,
      left,
    };
  }, [rect]);

  if (!targetFound || !rect || !coachmarkStyle) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="admin-onboarding-spotlight"
        className="pointer-events-none fixed z-[60] rounded-2xl border-2 border-teal-300 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.56),0_18px_44px_rgba(15,118,110,0.35)] transition-all"
        style={rect}
      />
      <div
        data-testid="admin-onboarding-coachmark"
        className="fixed z-[61] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-teal-100 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
        style={coachmarkStyle}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <MapPin aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              {step.coachmark}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {step.manual ? (
            <button
              type="button"
              onClick={() => onCompleteStep(step.id)}
              className="app-button-secondary px-3 py-2 text-xs"
            >
              Mark reviewed
            </button>
          ) : null}
          <Link href={step.href} className="app-button-primary px-3 py-2 text-xs">
            {step.actionLabel}
            <ChevronRight aria-hidden="true" size={14} />
          </Link>
        </div>
      </div>
    </>
  );
}

export function AdminOnboardingChecklist({
  progress,
  loading = false,
  onDismiss,
  onReopen,
  onCompleteStep,
  activeStepOverride = null,
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
  const activeStep = progress.steps.find((step) => !step.completed) ?? null;
  const displayedActiveStep =
    activeStep && activeStepOverride?.stepId === activeStep.id
      ? { ...activeStep, ...activeStepOverride }
      : activeStep;
  const completedSteps = progress.steps.filter((step) => step.completed);
  const incompleteSteps = progress.steps.filter((step) => !step.completed);

  const renderStep = (step: AdminOnboardingStep) => {
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
            className={
              step.completed
                ? "mt-0.5 shrink-0 text-teal-700"
                : "mt-0.5 shrink-0 text-gray-400"
            }
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
  };

  return (
    <section className="app-panel p-4 sm:p-5">
      {displayedActiveStep ? (
        <AdminOnboardingSpotlight
          step={displayedActiveStep}
          onCompleteStep={onCompleteStep}
        />
      ) : null}

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

      {displayedActiveStep ? (
        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
                Next step
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {displayedActiveStep.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                {displayedActiveStep.coachmark}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              {displayedActiveStep.manual ? (
                <button
                  type="button"
                  onClick={() => onCompleteStep(displayedActiveStep.id)}
                  className="app-button-secondary px-3 py-2 text-xs"
                >
                  Mark reviewed
                </button>
              ) : null}
              <Link
                href={displayedActiveStep.href}
                className="app-button-primary px-3 py-2 text-xs"
              >
                {displayedActiveStep.actionLabel}
                <ChevronRight aria-hidden="true" size={14} />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:hidden">
        {incompleteSteps.map(renderStep)}
        {completedSteps.length > 0 ? (
          <details className="rounded-xl border border-teal-100 bg-teal-50/40">
            <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-teal-800">
              Completed steps ({completedSteps.length})
            </summary>
            <div className="grid gap-2 border-t border-teal-100 p-2">
              {completedSteps.map(renderStep)}
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-4 hidden gap-2 sm:grid">
        {progress.steps.map(renderStep)}
      </div>
    </section>
  );
}
