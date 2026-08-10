import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test for the dark-mode contrast audit: parses the actual CSS
 * custom properties out of globals.css (not a hardcoded copy of them) and
 * checks real text/background pairs against WCAG AA — 4.5:1 for normal
 * text, 3:1 for large text / non-text UI components (icons, dots). Several
 * of these pairs were previously failing badly in dark mode (as low as
 * ~1.2:1 for the sidebar's active-row state) because color values were
 * either a literal mirror of the light-mode ramp or hardcoded hex shared
 * between themes. See CLAUDE.md §... dark mode contrast audit.
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

function blend(fgHex: string, alpha: number, bgHex: string): string {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const out = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
  return "#" + out.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** Extracts `--name: value;` custom properties from one `{ ... }` block, resolving one level of var() indirection. */
function parseBlock(css: string, selector: string): Record<string, string> {
  const blockMatch = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!blockMatch) throw new Error(`Could not find ${selector} block in globals.css`);
  const body = blockMatch[1];
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  // Resolve `var(--x)` references (values in this file never nest more than one level deep).
  for (const key of Object.keys(vars)) {
    const varRef = vars[key].match(/^var\(--([a-zA-Z0-9-]+)\)$/);
    if (varRef && vars[varRef[1]]) {
      vars[key] = vars[varRef[1]];
    }
  }
  return vars;
}

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf-8");
const light = parseBlock(css, ":root");
const dark = parseBlock(css, "\\.dark");

function checkText(label: string, textHex: string, bgHex: string, threshold = 4.5) {
  const ratio = contrastRatio(textHex, bgHex);
  it(`${label} (${textHex} on ${bgHex}) meets ${threshold}:1`, () => {
    expect(ratio).toBeGreaterThanOrEqual(threshold);
  });
}

describe("dark mode WCAG AA contrast", () => {
  checkText("foreground on background", dark.foreground, dark.background);
  checkText("card-foreground on card", dark["card-foreground"], dark.card);
  checkText("muted-foreground on background", dark["muted-foreground"], dark.background);
  checkText("muted-foreground on card", dark["muted-foreground"], dark.card);
  checkText("secondary-foreground on secondary", dark["secondary-foreground"], dark.secondary);
  checkText("primary-foreground on primary", dark["primary-foreground"], dark.primary);
  checkText("primary text on card (icons/accents using text-primary)", dark.primary, dark.card);
  checkText("primary text on background", dark.primary, dark.background);

  // The stone-* scale is used pervasively as secondary/muted text
  // (dates, hints, footnotes, "AWAITING" labels) across every page.
  checkText("stone-400 on background", dark["stone-400"], dark.background);
  checkText("stone-400 on card", dark["stone-400"], dark.card);
  checkText("stone-500 on background", dark["stone-500"], dark.background);
  checkText("stone-500 on card", dark["stone-500"], dark.card);
  checkText("stone-600 on background", dark["stone-600"], dark.background);

  // Non-text UI components (dots, borders) only need 3:1 per WCAG 1.4.11.
  checkText("stone-500 (tier dot) on card", dark["stone-500"], dark.card, 3.0);

  // Badge/chip text rendered on its own low-opacity tint over the card
  // surface — the actual composited pairing a user sees, not just the ink
  // color against a flat background.
  const card = dark.card;
  checkText("severity-best on its own 12% tint over card", dark["severity-best"], blend(dark["severity-best"], 0.12, card));
  checkText("severity-good on its own 10% tint over card", dark["severity-good"], blend(dark["severity-good"], 0.1, card));
  checkText(
    "severity-inaccuracy-text on its own 20% tint over card",
    dark["severity-inaccuracy-text"],
    blend(dark["severity-inaccuracy"], 0.2, card)
  );
  checkText(
    "severity-mistake-text on its own 16% tint over card",
    dark["severity-mistake-text"],
    blend(dark["severity-mistake"], 0.16, card)
  );
  checkText("destructive (BLUNDER) on its own 12% tint over card", dark.destructive, blend(dark.destructive, 0.12, card));
  checkText(
    "severity-missed-opportunity on its own 12% tint over card",
    dark["severity-missed-opportunity"],
    blend(dark["severity-missed-opportunity"], 0.12, card)
  );
  checkText(
    "severity-time-trouble on its own 12% tint over card",
    dark["severity-time-trouble"],
    blend(dark["severity-time-trouble"], 0.12, card)
  );
  checkText("destructive badge text on its own 20% tint over card", dark.destructive, blend(dark.destructive, 0.2, card));
  checkText("success badge text on its own 20% tint over card", dark.success, blend(dark.success, 0.2, card));

  it("bg-stone-900 is never paired with plain white text (the fixed active-row bug)", () => {
    // stone-900 is intentionally the LIGHTEST shade in dark mode (the ramp
    // is inverted) — text-white on top of it is the regression this guards.
    const ratio = contrastRatio("#ffffff", dark["stone-900"]);
    expect(ratio).toBeLessThan(2); // documents why bg-stone-900+text-white must never be reintroduced
  });
});

describe("light mode WCAG AA contrast (sanity check — should already pass)", () => {
  checkText("foreground on background", light.foreground, light.background);
  checkText("muted-foreground on background", light["muted-foreground"], light.background);
  checkText("primary-foreground on primary", light["primary-foreground"], light.primary);
});
