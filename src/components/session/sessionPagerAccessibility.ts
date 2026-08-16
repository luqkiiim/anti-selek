export function syncSessionPagerAccessibility({
  pager,
  activeSection,
  isWideLayout,
  focusFallback,
}: {
  pager: HTMLElement;
  activeSection: string;
  isWideLayout: boolean;
  focusFallback?: HTMLElement | null;
}) {
  const panels = Array.from(
    pager.querySelectorAll<HTMLElement>("[data-session-pager-section]")
  );
  const focusedElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  panels.forEach((panel) => {
    const isInactiveMobilePanel =
      !isWideLayout &&
      panel.dataset.sessionPagerSection !== activeSection;

    if (
      isInactiveMobilePanel &&
      focusedElement &&
      panel.contains(focusedElement)
    ) {
      focusFallback?.focus();
    }

    panel.inert = isInactiveMobilePanel;
    if (isInactiveMobilePanel) {
      panel.setAttribute("aria-hidden", "true");
    } else {
      panel.removeAttribute("aria-hidden");
    }
  });
}
