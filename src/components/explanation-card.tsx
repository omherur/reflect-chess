import type { ComponentType } from "react";

/**
 * One tile of the four-section explanation card (What your move did / What
 * it missed / Why the recommended move is stronger / What to remember).
 * Shared between the real review page (reveal-panel.tsx) and the home
 * page's real-example section, so the marketing page shows the actual
 * component, not a mockup.
 */
export function ExplanationCard({
  icon: Icon,
  label,
  text,
  tint,
  iconClass,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  text: string;
  tint: string;
  iconClass: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border p-3 ${tint}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-4 shrink-0 ${iconClass}`} />
        <p className="text-sm font-semibold text-stone-800">{label}</p>
      </div>
      <p className="text-sm text-stone-700">{text}</p>
    </div>
  );
}
