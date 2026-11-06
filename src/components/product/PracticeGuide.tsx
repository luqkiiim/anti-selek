"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import { useAppLocation } from "@/components/app/AppShell";
import { navigateApp } from "@/lib/appNavigation";
import type { AdminOnboardingStepId } from "@/lib/adminOnboarding";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";
import { ErrorText } from "./Primitives";
import "./practice.css";

export function OpenPractice() {
  const router = useRouter();
  const action = useAdminAction(async () => {
    const result = await adminApi<{ playground: { clubId: string } | null }>("/api/tutorial-playground");
    if (result.playground) navigateApp(router, `/club/${encodeURIComponent(result.playground.clubId)}`);
  });
  return <div className="practice-entry"><button className="text-button" disabled={action.busy || action.uncertain} onClick={() => void action.run(signal => adminApi<{ playground: { clubId: string } }>("/api/tutorial-playground", "POST", undefined, { signal }), result => navigateApp(router, `/club/${encodeURIComponent(result.playground.clubId)}`))}>Practice</button><ErrorText error={action.error} />{action.uncertain && <button className="text-button" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>Refresh to check</button>}</div>;
}

type GuideProps = { enabled: boolean; step?: AdminOnboardingStepId; revision?: string | number };
export function PracticeGuide(props: GuideProps) { return props.enabled ? <EnabledPracticeGuide {...props} /> : null; }
function EnabledPracticeGuide({ enabled, step, revision }: GuideProps) {
  const router = useRouter();
  const href = useAppLocation();
  const guide = useAdminOnboardingProgress(enabled);
  const complete = guide.completeStep;
  const refresh = guide.refresh;
  useEffect(() => { if (enabled && step) complete(step); }, [enabled, step, complete]);
  useEffect(() => { if (enabled && revision !== undefined) void refresh(); }, [enabled, revision, refresh]);
  useEffect(() => {
    if (!enabled || !guide.progress || guide.progress.dismissed) return;
    const id = new URL(href, "https://anti-selek.local").hash.slice(1);
    if (!guide.progress.steps.some(item => item.targetId === id)) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.classList.add("practice-target");
    target.scrollIntoView?.({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
    return () => target.classList.remove("practice-target");
  }, [enabled, href, guide.progress]);
  if (!enabled || !guide.progress) return null;
  if (guide.progress.dismissed) return <button className="text-button" onClick={guide.reopen}>Open guided practice</button>;
  return <details className="practice-guide" open><summary>Guided practice <small>{guide.progress.steps.filter(item => item.completed).length}/{guide.progress.steps.length}</small></summary>
    <ol>{guide.progress.steps.map(item => <li key={item.id}><span aria-label={item.completed ? "Completed" : "Not completed"}>{item.completed ? "✓" : "○"}</span><button className="text-button" onClick={() => navigateApp(router, `${item.href}#${item.targetId}`)}>{item.title}</button>{item.manual && !item.completed && <button className="text-button" aria-label={`Mark ${item.title} reviewed`} onClick={() => complete(item.id)}>Mark reviewed</button>}</li>)}</ol>
    <button className="text-button" onClick={guide.dismiss}>Hide guide</button>
  </details>;
}
