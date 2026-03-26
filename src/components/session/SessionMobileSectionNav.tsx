"use client";

interface SessionMobileSectionNavItem {
  id: string;
  label: string;
}

interface SessionMobileSectionNavProps {
  sections: SessionMobileSectionNavItem[];
  activeSection: string;
  onSelect: (sectionId: string) => void;
}

export function SessionMobileSectionNav({
  sections,
  activeSection,
  onSelect,
}: SessionMobileSectionNavProps) {
  return (
    <div className="app-panel-soft p-1.5">
      <div
        className={`grid gap-1 ${sections.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {sections.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
