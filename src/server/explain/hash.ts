/** Tiny deterministic string hash, used to pick a stable-but-varied choice from a small list (e.g. per key moment) without needing real randomness. */
export function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
