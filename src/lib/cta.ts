/**
 * The call-to-action treatments, in one place.
 *
 * Deliberately built on --primary rather than a custom gold gradient: the
 * theme tokens are already contrast-checked in both modes (see
 * src/lib/contrast.test.ts), and a hand-rolled gradient would quietly opt out
 * of that. The "pop" comes from size, a coloured shadow, a ring, and lift on
 * hover instead.
 *
 * Shared by the landing hero and the upgrade prompts so that "the most
 * important button on the page" looks like one thing across the product,
 * rather than drifting into two near-identical variants.
 */
export const PRIMARY_CTA_CLASS =
  "h-12 w-full px-8 text-base font-semibold shadow-lg shadow-primary/30 ring-2 ring-primary/25 " +
  "transition-transform hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 sm:w-auto";

/**
 * Still clearly second to the primary, but not a flat outline that reads as
 * disabled next to it — both CTAs are meant to be noticed.
 */
export const SECONDARY_CTA_CLASS =
  "h-12 w-full border-primary/45 px-8 text-base font-semibold shadow-sm transition-transform " +
  "hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/10 sm:w-auto";
