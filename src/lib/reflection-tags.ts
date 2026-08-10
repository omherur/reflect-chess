/**
 * Curated, optional quick-select tags for a reflection — shared between the
 * client (chip picker) and the server (validation), so both always agree on
 * the allowed set.
 */
export const REFLECTION_TAGS = [
  "I was rushing",
  "I didn't consider alternatives",
  "I felt confident",
  "I was worried about a threat",
  "I missed something obvious",
  "I was following a general plan",
] as const;

export type ReflectionTag = (typeof REFLECTION_TAGS)[number];

export function isReflectionTag(value: string): value is ReflectionTag {
  return (REFLECTION_TAGS as readonly string[]).includes(value);
}
