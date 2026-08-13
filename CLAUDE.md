# ReflectChess — Project Memory

This file reflects the **actual current state of the code**, verified against the repository, not a wishlist. Update it at the end of future sessions so it stays accurate.

@AGENTS.md

---

## 1. Product Overview

ReflectChess is a chess self-reflection tool. Its core mechanic: capture what a player was **actually thinking** about a move — their reasoning, confidence, and what they'd play on a second look — *before* the engine's verdict is shown. The point isn't just tactical accuracy; it's finding **recurring thinking patterns** (rushing, not considering alternatives, misplaced confidence, etc.) that a plain engine-analysis tool can't surface, because it never asks what you believed in the moment.

### The one rule that must never be violated

**Engine evaluation, best move, classification, and verdict must NEVER be shown to the client until the user's full reflection has been submitted** — reasoning text, confidence rating, replay move (or "same move"), any triggered adaptive follow-up answer, and optional tags. This is enforced in exactly one place:

- `src/server/keymoments.ts` → `toClientView(km, reflection)` is the **only** function permitted to serialize a `KeyMoment` for the client. It returns a narrow `KeyMomentPublic` (id, sortIndex, ply, fen, originalSan, originalUci, reviewStatus — nothing engine-derived) until `reflection` exists and `reviewStatus === "REVIEWED"`, only then returning the full `KeyMomentVerdict`.
- Any new API route or server function that touches a `KeyMoment` for client consumption **must** go through this gate. Do not add a shortcut that returns raw Prisma fields.
- Verify this holds by checking a `PENDING` moment's API payload only ever contains the `KeyMomentPublic` field set — this has been the standard verification step after every change all session.

---

## 2. Tech Stack

- **Next.js 16.2.12**, App Router, Turbopack. **Note:** this version has real breaking changes vs. training-data assumptions — `middleware.ts` is renamed to `src/proxy.ts` (exported function is `proxy`, not `middleware`) and runs on the **Node.js runtime by default** (not edge-only), so Prisma queries work directly inside it. Consult `node_modules/next/dist/docs/` before assuming old-Next.js conventions.
- **React 19.2.4**, TypeScript (strict), target ES2017 (no `/s` regex flag — use `[\s\S]*` instead).
- **Tailwind CSS v4** (CSS-first `@theme` config, no `tailwind.config.js`) + **shadcn/ui** components built on **base-ui** primitives (`@base-ui/react`) — not Radix. Composition pattern for links-as-buttons is `<Link><Button>...</Button></Link>`, not `asChild`.
- **Prisma 6.19.3 + SQLite** (`prisma/schema.prisma`, `prisma/dev.db`).
  - **Known environment quirk:** `npx prisma migrate dev` fails non-interactively in this environment ("Prisma Migrate has detected that the environment is non-interactive"). The established workaround: generate the diff manually and apply it —
    ```bash
    npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "file:./shadow-diff.db" --script > prisma/migrations/<timestamp>_<name>/migration.sql
    rm -f shadow-diff.db
    npx prisma migrate deploy
    npx prisma generate
    ```
    Redirect stdout only (not `2>&1`) when capturing the SQL — the deprecation warning line otherwise gets written into the migration file.
- **chess.js ^1.4.0** for move validation, FEN handling, SAN/UCI conversion, PGN parsing (including `%clk` comment extraction).
- **react-chessboard ^5.10.0** for the interactive board; a hand-rolled unicode-glyph `MiniBoard` (no react-chessboard) for lightweight dashboard thumbnails.
- **Stockfish 18 WASM** via a Node child process (`src/server/engine/runner.cjs`, UCI protocol). Wrapped in `src/server/engine/engine.ts`'s `StockfishService` — **a single lazy global singleton with one serialized request queue**. This is important context for the open batch-analysis issue below (see §7).
- **Claude API** (`@anthropic-ai/sdk`) for personalized explanation generation — model is **`claude-sonnet-5`** (upgraded from Haiku; Sonnet was deliberately chosen since explanation quality is the core product value). Automatic fallback to a deterministic template provider on any failure or missing key. **`ANTHROPIC_API_KEY` is configured and the AI path is verified working live** (see §6 — this was broken for two independent reasons, both fixed). **Important:** `claude-sonnet-5` defaults to adaptive extended thinking when the `thinking` param is omitted, and thinking tokens draw from the same `max_tokens` budget as the answer — always pass `thinking: { type: "disabled" }` on calls that need a reliable structured-JSON answer (see `src/server/explain/claude-provider.ts` and `src/server/summary/claude-provider.ts`), or a call can silently return empty text with `stop_reason: "max_tokens"`.
- **Supabase Auth** (`@supabase/supabase-js` + `@supabase/ssr`) for email/password login — **identity only**; all application data stays in local Prisma/SQLite. See §9.
- **Supabase Auth** (`@supabase/supabase-js` + `@supabase/ssr`) for email/password login — **identity only**; all application data stays in local Prisma/SQLite. See §9.
- **next-themes** for dark mode (wired to a `ThemeProvider` + header toggle button).
- **Vitest** for tests (332 tests / 21 files as of this writing, all passing), colocated `*.test.ts` files. Environment is `node` and `include` is `src/**/*.test.ts` — there is **no jsdom and no testing-library**, so component behavior is not unit-testable as configured; verify UI changes in the running app instead.

---

## 3. Data Model (`prisma/schema.prisma`)

- **User** — the application's record of a person. Identity itself lives in **Supabase Auth**; this row is the local anchor for `games` and `accounts`. `supabaseUserId` (unique, nullable) is the link, `email` is mirrored from Supabase for display and the admin view, and `name` is now **display-only** — not unique, not a login identifier. Nullable auth fields exist so the seed script and test fixtures can create users that never authenticate.
- **Session** — *removed*. Supabase manages sessions via its own cookies; there is no local session table any more.
- **ChessAccount** — links a `User` to a Chess.com `username`; `lastSyncedAt` drives incremental auto-sync.
- **Game** — one imported/synced game. `analysisStatus` (`PENDING|ANALYZING|ANALYZED|FAILED`) + `analysisProgress` (0-100) drive the UI polling. `terminationReason` (parsed from the PGN `Termination` header: checkmate/resignation/timeout/abandoned/agreement/other) and `userRating` (parsed from `WhiteElo`/`BlackElo`) support time-trouble handling and the Performance tab respectively. `summary`/`summaryGeneratedAt` cache the post-game summary (JSON-serialized `StructuredGameSummary`), generated once lazily the first time every key moment is reviewed — see `src/server/summary/`.
- **GameMove** — one ply. `clockSeconds` is the mover's clock reading after the move, parsed from PGN `%clk` annotations when present (real Chess.com imports have this; manually pasted PGNs usually don't).
- **KeyMoment** — a flagged, reviewable moment. `classification` (BEST/GOOD/INACCURACY/MISTAKE/BLUNDER/MISSED_OPPORTUNITY/FORCED/TIME_TROUBLE), `conceptHighlights` (JSON array of `{concept, note, squares}` — already filtered for relevance, see §5), `importanceScore`/`importanceTier`, `reviewStatus` (PENDING/REVIEWED) which is what the reflection-first gate keys off.
- **Reflection** — one-to-one with a reviewed `KeyMoment`. Fields, in the order they were added:
  - `thoughts`, `replaySame`, `replayMoveSan`/`replayMoveUci` — the original two-question mechanic.
  - `confidence` (Int, 1-5, **required** at the API layer; schema default of 3 exists only so the migration didn't need a backfill).
  - `tags` (JSON string array, optional, validated server-side against `src/lib/reflection-tags.ts`'s `REFLECTION_TAGS` allowlist of 6 fixed options).
  - `followUpQuestion` / `followUpAnswer` (nullable strings) — populated only when the initial `thoughts` answer was judged "thin" by `src/server/explain/followup.ts`'s `isThinReflection()` (word-count + filler-phrase heuristic), and the user then answered the one generated follow-up. Never re-asked for the same key moment.
  - `replayEvalCp`/`replayEvalMate`/`replayVerdict`, `explanation` (JSON-serialized `StructuredExplanation`, generated once at reflect-time, personalized to the specific reasoning + replay move).
- **AnalysisCache** — engine result cache keyed by `(fen, settings)`, shared across all games/users.
- **WaitlistSignup** — a pre-launch email signup from the landing page. Deliberately **not** related to `User`: someone on the waitlist has no account and may never make one. `email` is unique and stored normalized (trimmed + lowercased via `src/lib/email.ts`, so casing/whitespace variants are one person); `source` records which CTA it came from so placements can be compared without a schema change.

---

## 4. Design System

"A well-used wooden chess set and an old chess book" — warm, considered, not a generic tech dashboard. Defined entirely in `src/app/globals.css` via Tailwind v4's `@theme` block plus `:root`/`.dark` CSS variables.

**Anchors:** parchment background `#FAF6EF` (light) / deep charcoal-brown `#1C1712` (dark, "a reading room at night" — same warm mood, not a generic inversion); warm near-black text `#2A2320` (light) / warm cream `#F2ECDF` (dark).

**Accents:**
- Primary (buttons, active states): walnut `#6F4518` (light) / lightened `#B3792F` (dark, for contrast against the dark bg).
- Success (good/best, positive progress): forest green `#2F4F3D` (light) / `#4F7A63` (dark).
- Destructive shares the same oxblood as the BLUNDER severity color — deliberately unified.

**Severity family** (one coherent palette, used for badges, left-edge card strips, and tier indicators everywhere — see `src/lib/format.ts`'s `classificationClass`/`classificationBorderClass`):
| Classification | Color |
|---|---|
| BLUNDER / CRITICAL | oxblood `#8B2E2E` |
| MISTAKE / NOTABLE | ochre `#B8860B` |
| INACCURACY | muted tan-gold `#D4B96B` |
| GOOD | forest green `#2F4F3D` |
| BEST | brighter forest green `#3B6B4E` |
| MISSED_OPPORTUNITY | muted plum `#6B4A6B` |
| TIME_TROUBLE | muted slate-blue `#4A6178` (deliberately outside the red/ochre "your fault" spectrum) |
| FORCED | neutral (remapped stone scale) |

**Key implementation detail:** rather than retrofitting every hardcoded `stone-*` Tailwind utility across the codebase, the entire `stone` color scale was **remapped** in `@theme` (`--color-stone-50` through `--color-stone-950`) to a warm sandstone→walnut ramp. Every existing `bg-stone-50`/`text-stone-600`/`border-stone-200` usage picked up the new palette for free. Any new component should keep using `stone-*` utilities for neutral tones rather than inventing new grays.

**Typography:**
- Headings: **Newsreader** (serif, "old chess book" feel) — wired via `--font-heading`, applied globally to `h1`-`h4` in `globals.css`'s `@layer base` (not per-component).
- Body: **Inter** (`--font-sans`/`--font-body`).
- Chess notation / engine lines: **Geist Mono** (`--font-mono`).

**Other conventions:** modest radius (`--radius: 0.4rem` — deliberately not the rounded "app bubble" look), chessboard squares already use warm wood tones (`#8b7355` dark / `#f0dfc4` light) in both `ReviewBoard` and the dashboard's `MiniBoard`, so no board-color work is needed.

**Brand mark:** `src/components/brand/logo.tsx` — the split gold/silver king in its open arc, standing on a perspective board with a fading reflection. It is **vector, hand-drawn from the source artwork**, not the raster original: the supplied logo is a black-background PNG (unusable on the parchment theme), the header needs it legible at 28px, and the "bright" half has to flip between silver (dark theme) and warm charcoal (light theme) or it disappears against one of them. Those halves read from `--brand-gold-1..3` / `--brand-silver-1..3` in `globals.css`, so both themes are handled at the token level. Exports: `LogoMark` (icon only — header, favicon), `LogoFigure` (mark + board + reflection), `LogoWordmark`. It stays a **server component** — `idPrefix` is a prop rather than `useId()` specifically so a static drawing costs the client no JavaScript; the prop exists because SVG gradient/clip ids are document-global and the header and hero both render a mark. `src/app/icon.svg` is the standalone favicon version, which can't read CSS variables, so its theme-dependent half uses an internal `prefers-color-scheme` query instead. The stock Create Next App `favicon.ico` was removed in its favor.

Two SVG gotchas this cost time on, worth not rediscovering: a `*/` inside a block comment (`--brand-gold-*/--brand-silver-*`) silently ends the comment and breaks the parse; and `mask` + `transform` on the *same* element share a coordinate system, so a mirrored reflection has its fade mask flipped along with it — the transform must go on a nested child.

**Dark mode:** wired via `next-themes` (`src/components/theme-provider.tsx` + `theme-toggle.tsx`, a header button). This was previously installed but never connected — now fully functional.

---

## 5. Feature Status — What's Actually Working

| Area | Status | Notes |
|---|---|---|
| Chess.com import (manual PGN paste + `/import`) | **Working** | `src/lib/import/chesscom.ts`, candidate dedup by `externalId` |
| Auto-sync on dashboard load | **Working** | `POST /api/sync`, fires once per mount if a `ChessAccount` is linked, verified live |
| Login / multi-user | **Working, replaced** | **Email/password via Supabase Auth** (§9), verified live end to end: sign up → session → demo game seeded → sign out → sign back in to the same account. Replaced password-less name login outright; `getCurrentUser()` kept its signature so the ~24 guarded routes were untouched, and the IDOR fix still holds since ownership checks key off `user.id` |
| Google sign-in | **Working, new** | "Continue with Google" / "Sign up with Google" on both auth pages, via `supabase.auth.signInWithOAuth`. Verified: the real button redirects to `accounts.google.com`, and Supabase's authorize endpoint issues the correct `client_id` (`4677653866…apps.googleusercontent.com`), scopes `email profile`, authorization-code flow with `state`. The consent step itself was not completed — that would mean authenticating as the owner's own Google account |
| Navbar auth state | **Working** | Signed out shows **Sign in** (ghost) + **Sign up** (primary); signed in shows the display name and a **Sign out** button. Display name is derived from the email's local part at first sign-in and is cosmetic only |
| **IDOR fix** | **Fixed & verified** | All game-scoped routes (`/api/games/[id]`, `.../analyze`, `.../reflect`, `.../hint`) now check `game.userId === user.id`; previously did not |
| Key-moment detection/selection | **Working, recently overhauled** | Now uses **win-probability** (`winProbLoss` in `src/lib/chess/eval.ts`, Lichess-style logistic curve), not raw centipawn delta, as the significance metric. Verified live: some games now correctly surface fewer key moments than the old minimum guarantee would have padded to |
| Concept detection (pin/fork/skewer/hanging piece/back-rank/king exposure) | **Working, hardened, now materiality-gated** | Each detector verified against real chess rules (color, line-of-sight, alignment) with true-positive + false-positive-trap coverage. A real bug (mixed-color "pin" through a blocking pawn) was found and fixed with a permanent regression test. **Being geometrically real is no longer sufficient** — see §10: a tactic whose targets are adequately defended wins nothing and is now dropped, via a static exchange evaluation in `src/server/explain/exchange.ts` |
| Concept **relevance filtering** | **Working** | `filterRelevantConcepts` in `src/server/explain/concepts.ts` — a concept only survives if spatially connected to the move played, the best move, or the immediate PV. Fixes concepts like back-rank weakness being mentioned when irrelevant to the specific move |
| Reflection capture (reasoning + replay move) | **Working** | Two-question core mechanic, gate-verified repeatedly |
| Reflection capture — confidence/tags/follow-up/voice | **Working, recently added** | 1-5 confidence (required), 6 optional tags, adaptive one-shot follow-up for thin answers, Web Speech API voice input (graceful no-op on unsupported browsers via `useSyncExternalStore`, not a hydration-unsafe effect). The "settle on this move over other options" follow-up question is skipped when the replay move equals the original — nothing to explain there |
| Explanation generation | **Working via Claude, verified live, now two-layer** | See §6 — was broken for two independent reasons (missing key, then an adaptive-thinking token-budget bug), both fixed and verified with real API calls. "Why the recommended move is stronger" now names an underlying chess principle (center control, king safety, piece activity, etc.), not just a restated eval. The replay move gets a distinct scannable verdict badge (Matches best / Improvement / Equal to original / etc.) plus explicit acknowledgment in prose |
| Reveal panel layout | **Working, restructured again** | "Your reasoning"/"Your replay move" (+ confidence dots, tags, follow-up) render in a quote-styled block at the top. Below it the reveal now opens on a **three-line summary** beside the board; the four AI cards, eval numbers, engine line and concept list sit behind an **Explain more** button — see §10 |
| Reveal progress bar | **Working, new** | The reflect route streams NDJSON stage events while it works, and the form shows a real staged progress bar instead of a static "Revealing…" — see §10. Verified that Next 16 + Turbopack flushes the events incrementally rather than buffering them |
| Pre-reveal focused view | **Working** | Move list + sidebar visually dim (`opacity-40`, brightens on hover) while a key moment is still `PENDING` |
| Hint button | **Working** | Non-revealing, deterministic + concept-flavored, never names a move or shows eval |
| Dashboard (grid, thumbnails, bulk analyze, filters, sort, momentum) | **Working** | Includes the "N thoughts recorded" persistent counter (distinct from the 3 stat cards) |
| Time-trouble / clock-aware analysis | **Working** | `applyTimeTroubleAdjustment` suppresses false blunder flags when lost on time, injects one dedicated `TIME_TROUBLE` moment instead |
| Performance tab | **Working** | Engine-predicted rating (ACPL-based, separate from win-probability selection) vs. actual Chess.com rating, plus a second reflection-quality-based trajectory, each with its own milestone bar |
| Public home page | **Working** | `src/components/landing/landing-page.tsx`, reuses the real `ExplanationCard` component for its "real example" section, redirects signed-in users to the dashboard at the same `/` route |
| Landing hero — above-the-fold constraint | **Working, deliberate** | The hero is built so a first-time visitor sees the **whole** offer without scrolling: wordmark, one-liner, sub-head, both CTAs, and the waitlist. That is why the king is a low-opacity background watermark (`LogoFigure` at `opacity-[0.055]`) rather than a block of vertical space — it costs no layout height. **Any addition to the hero has to be re-measured, not eyeballed**; the check is `document.querySelector('form').parentElement.getBoundingClientRect().bottom <= innerHeight`. Verified fitting at 1280×800 (218px slack), 1440×640 (58px slack), and 390×844 mobile (66px slack) — the 640px-tall case is the binding one |
| Landing CTAs | **Working** | Primary "Get started — it's free!" → `/login`; secondary "Analyze a free demo game" → `/login?demo=1`, which swaps the login card's title and body to the demo offer (same one-field signup either way — the flag only changes framing). They intentionally share a destination: **using ReflectChess requires an account**, so the demo is something you sign up for, not a separate no-auth path. The promise is backed by real seeding — see the demo-game row below. The "pop" is built from size + coloured shadow + ring + hover lift on top of `--primary`, *not* a hand-rolled gradient, so it keeps the contrast guarantees `src/lib/contrast.test.ts` enforces. Signed-out gating re-verified: `/games`, `/import`, `/performance`, `/admin/*` all 307 → `/login`, API routes 401 |
| **Batch analysis ("Analyze all")** | **Fixed, verified live** | See §6 — a finished game's key moments now appear immediately, without waiting for the rest of the batch |
| Post-game summary page | **Working** | `/games/[id]/summary`, triggered automatically when the last key moment in a game is reviewed (see `game-review.tsx`'s `handleReviewed`). Generated once via Claude + deterministic-template fallback (same architecture as move explanations), cached on `Game.summary`. Synthesizes a narrative, an honest recurring-pattern check (never fabricated), focus advice, a confidence/tags observation, and a deterministic ACPL-based estimated rating for that game |
| Dark mode contrast | **Audited and fixed, WCAG AA** | See §6 — the severity badge family, `stone-400`/`stone-500` (used app-wide as secondary text), and a critical `bg-stone-900 text-white` active-row bug were all failing contrast in dark mode. Fixed at the token level in `globals.css` + a durable `src/lib/contrast.test.ts` that parses the real CSS and checks real WCAG ratios |
| Brand mark in the app | **Working, new** | `LogoMark` in the header, `LogoLockup` in the landing hero, `src/app/icon.svg` as the favicon. See §4 — it's a vector redraw of the supplied artwork, not the PNG |
| Waitlist capture | **Working, new** | `POST /api/waitlist` + `WaitlistForm` in **two** places — the hero (`source: "landing-hero"`, directly under the two CTAs) and the closing section (`source: "landing-closing"`), which is what the `source` column is for. Public route (no session), validated by `src/lib/email.ts` on both sides, `upsert`-based so re-signing-up is a success (`alreadyOnList: true`) rather than an error and the original signup time survives. Verified end to end through the real UI; there is **no admin view of signups yet** — read them with Prisma |
| Demo game seeded on signup | **Working, new** | Every **new** account gets one fully analyzed game inserted at signup, so the landing CTA ("your first game comes back analyzed") is true on arrival instead of showing an empty dashboard. `src/server/demo/seed-demo-game.ts` inserts from `src/server/demo/demo-game.ts` — a checked-in fixture exported from a real analysis run (`prisma/export-demo-game.ts` regenerates it), **not** a copy of a DB row, because a fresh production database has nothing to copy and signup must not depend on the engine. Stored as `platform: "demo"` / `externalId: "demo-seed-v1"`, which `platformLabel` renders as "Demo game" so it can't be mistaken for the user's own. Idempotent (unique on `[userId, platform, externalId]`) and it **never throws** — a seeding failure must not break a login. `/api/auth/login` is no longer an `upsert`, because upsert can't tell you whether it created the account |
| Admin area (signups + waitlist) | **Working, new** | `/admin` — every account (name, signup time, games, reflections, linked Chess.com username) and every waitlist signup (email, source, time), plus five summary counters. **Gated by an `ADMIN_KEY` secret, not by identity** — see §8. Server-rendered, and the data is only queried *after* the gate passes, so a locked visitor's HTML contains no names or emails at all rather than fetching and hiding them |
| Explanation provenance debug view | **Working** | `/admin/explanations` — shows the last N generated explanations, whether each came from Claude / was grounding-patched / fell back to the template, and why, with an auto-refreshing table and a fallback-ratio warning banner. **Now behind the same `ADMIN_KEY` gate** (it was previously readable by any signed-in user); both the page and `/api/admin/explanations` are gated, since gating only the page would leave the entries one fetch away |

---

## 6. Resolved Bugs — Session History (kept for context on recurring issues)

### The explanation-fallback / templated-repetition bug — RESOLVED, root-caused twice

**Symptom reported (multiple times):** the exact same generic sentence structure — e.g. *"[move] addresses the concrete problem in the position instead of leaving it standing"* or *"[move] would have kept the position at a point where... rather than where [move] actually left it"* — appeared verbatim across different, unrelated positions, instead of real position-specific AI reasoning.

**Root cause #1:** no `ANTHROPIC_API_KEY` was configured anywhere in this environment. Fixed by adding a real key. Logging for this case (`[explain] No ANTHROPIC_API_KEY configured...` on every call) was already in place from an earlier session.

**Root cause #2 (found only after adding a key — the reason the bug could recur even with a valid key):** `claude-sonnet-5` defaults to **adaptive extended thinking** when the `thinking` param is omitted, and thinking tokens are drawn from the same `max_tokens` budget as the answer. On a position where the model "thought" longer, it could consume the entire budget and return `stop_reason: "max_tokens"` with **zero answer text** — a genuine API response, silently indistinguishable from failure, causing a fallback to the template. Fixed by explicitly passing `thinking: { type: "disabled" }` on every Claude call (`explain/claude-provider.ts`, `summary/claude-provider.ts`) and raising `max_tokens` for headroom.

**Current safeguards:**
1. `[explain]` / `[summary]` prefixed logs on every fallback, including the triggering error and (for empty responses) `stop_reason`/`output_tokens`/content block types.
2. `src/server/explain/monitor.ts` — an in-memory log of the last 50 explanations with source (`ai` / `ai-patched` / `template`), plus a **live similarity check**: if two AI-sourced explanations for different key moments share ≥55% of their "whyBestIsBetter" vocabulary, it logs `[explain] POSSIBLE TEMPLATE-FALLBACK REGRESSION` — this is the automated detector that didn't exist before.
3. **`/admin/explanations`** — a debug page (any signed-in user) showing that same log as a table, with a warning banner if ≥50% of recent explanations didn't come from the real AI path.
4. Regression tests in `generate.test.ts` and `monitor.test.ts` assert the exact banned phrases never reappear.

**Verified live** with real API calls against real dev-DB key moments and through the full UI reflect flow — distinct, mechanism-grounded, principle-naming text confirmed for multiple different positions, zero occurrences of either banned phrase.

### Batch analysis UX bug ("Analyze all" showing stale "no key moments") — RESOLVED

**Root cause:** `dashboard-view.tsx`'s poll only merged `analysisProgress`/`analysisStatus` into local state each tick — a full `/api/dashboard` refetch (which is what actually carries `totalKeyMoments`/`reviewedKeyMoments`/thumbnails) only fired once **every** game in the batch left "ANALYZING." A finished game's card stayed stuck showing stale zeros until the whole batch completed.

**Fix:** the poll now triggers a full refetch as soon as **any** game in the batch transitions out of "ANALYZING," not just when all of them do. Verified live with a real 18-game batch — games showed their real key-moment counts and "Start review" progressively as each finished, not in one batch jump at the end.

### Dark mode WCAG AA contrast — RESOLVED

The `stone-*` color ramp is deliberately inverted in dark mode (stone-900 = lightest, not darkest) — several places assumed the light-mode direction. Worst case: the sidebar's active-row highlight used `bg-stone-900 text-white`, which in dark mode rendered white text on near-white (1.18:1 contrast). The entire severity badge family (BLUNDER/MISTAKE/INACCURACY/GOOD/BEST/MISSED_OPPORTUNITY/TIME_TROUBLE) also reused identical hex values in both themes, measuring 1.7–2.5:1 in dark mode. Fixed via new theme-aware `--severity-*` CSS variables with dedicated dark-mode values, plus brightened `stone-400`/`stone-500`/`--primary`/`--success`/`--destructive` dark values. Locked in by `src/lib/contrast.test.ts`, which parses the real `globals.css` and checks real WCAG ratios (27 checks) — not a copy of the values.

### IDOR: `/games/[id]` page had no ownership check — RESOLVED (found while building the summary page)

`getGameReviewData()` (used by the RSC page's initial SSR load) never filtered by `userId` — only the client-side refetch API route checked ownership. Any signed-in user could view **any other user's full game**, including private pre-reveal reflection text, just by knowing/guessing the game ID. Confirmed exploitable, then fixed by moving the ownership check into `getGameReviewData()` itself (now takes `userId` and returns `null` for a non-owned game), so both callers are correct by construction. The same pattern was applied to the new summary page from the start (`getOrGenerateGameSummary`).

### Theme-toggle hydration mismatch — RESOLVED

`ThemeToggle` picked its icon from `resolvedTheme`, which next-themes leaves `undefined` on the server (its state initializer returns early when there's no `window`) and fills from `localStorage`/`matchMedia` on the client. So the server sent a Moon and the client's hydration render wanted a Sun for anyone resolving to dark — a genuine mismatch. The stale comment in the file claimed `suppressHydrationWarning` on `<html>` covered it; it does not, since that opt-out only applies to that element's own attributes and text, not to a descendant subtree.

**Fix (deliberately *not* the "mounted" guard):** render both icons and let CSS choose — `<Moon className="size-4 dark:hidden" />` + `<Sun className="hidden size-4 dark:block" />`. The markup is then identical on server and client, so there's nothing to mismatch, *and* next-themes' blocking inline script sets `.dark` on `<html>` before first paint, so the right icon is up immediately — no placeholder flash and no wrong-icon flash, which a `mounted` guard would have introduced. Works because `globals.css` declares `@custom-variant dark (&:is(.dark *))` and the button is a descendant of `<html>`.

**Verified** by reproducing first: with the old code, Next's dev overlay showed 2 errors — "Hydration failed…" pointing at `theme-toggle.tsx (17:35) @ ThemeToggle`, plus a "Encountered a script tag while rendering React component" console error from `theme-provider.tsx`. After the fix, **both** are gone: the script-tag error was a downstream effect of the client re-render that mismatch recovery triggered, not an independent bug. Confirmed zero overlay errors on a hard reload in both dark and light mode, and the toggle still flips theme + icon correctly.

Note: hydration errors in Next 16 dev surface **only in the dev-tools overlay**, not as a plain `console.error` — reading the browser console alone will look deceptively clean. To check programmatically, read the text of `document.querySelector('nextjs-portal').shadowRoot` and page through it with the `[data-nextjs-dialog-error-next]` button.

---

## 7. Next Steps / Open Work

1. **Voice input** has only been feature-detection-tested (mic icon appears/disappears correctly); actual speech-to-text transcription accuracy has not been verified live (no real microphone input in this environment).
2. **Concept-relevance filter is sometimes overly strict.** `filterRelevantConcepts` occasionally drops a real, correct tactic (observed: a genuine pin) because its squares weren't judged "connected enough" to the move/PV. With an empty verified-concept list, any tactical word the model uses then counts as a grounding violation and gets patched back to template text. Still unfixed, but it now hurts less: `applyGrounding` prefers the model's own *surviving* prose over the template when replacing a summary line (§10).
3. **The signed-in reveal flow has not been clicked through since the §10 changes.** The summary layer, the "Explain more" toggle and the progress bar were verified by unit tests, by a real Claude run against real dev-DB moments, and by confirming the route streams incrementally — but not by a human-eye pass of the rendered panel, because doing so requires signing in and Claude may not enter a password. Worth one look.
4. General note: `src/proxy.ts` gates **everything** not in `PUBLIC_PREFIXES` behind a session — any new route meant for signed-out visitors (a public API, a static asset served from `app/`) must be added there, or it silently 401s/redirects to `/login`. This bit both `/api/waitlist` and `/icon.svg` when they were added.
5. General note: after any schema change, remember the non-interactive `prisma migrate dev` limitation in §2 — use the manual diff+deploy workaround, not `migrate dev` directly. Also remember: **the running dev server's Prisma Client is loaded once at process start** — after `npx prisma generate`, the dev server must be restarted (not just hot-reloaded) or it'll throw "Unknown field" errors against the new schema.

---

## 8. Admin Access — An Email Allowlist

`/admin` and `/admin/explanations` are gated by `isAdminUser()` in `src/server/admin-auth.ts`, which checks the signed-in user's email against the `ADMIN_EMAILS` allowlist (comma-separated, env only). Currently: `om.herur@gmail.com`.

**This only became a safe design once real auth landed, and the history is worth keeping.** Under password-less login an account was claimed by typing its name, so `user.name === "Om"` was bypassed by typing "Om" — identity proved nothing, and admin had to be gated by a shared `ADMIN_KEY` secret with an unlock cookie. Since §9, Supabase verifies a password, so the question "who is this" finally has a trustworthy answer, and the key plus its unlock route, form and lock button were deleted.

The email compared is the one **mirrored from Supabase onto the local row at sign-in** — not anything the user can set — which is what makes the check meaningful.

- **Fails closed:** `ADMIN_EMAILS` unset or empty ⇒ nobody is an admin, including you.
- **A non-admin gets a 404, not a 403**, so the page's existence isn't confirmed to someone who can't use it.
- The **API route is gated too** (`/api/admin/explanations` → 403). Gating only the page would leave the data one fetch away.
- The header's **Admin link renders only for allowlisted users**.
- `src/server/admin-auth.test.ts` (14 tests) covers the fail-closed cases and near-miss addresses — different domain, plus-addressed, gmail dot-trick, sub/superstrings — all rejected; casing and whitespace ignored.

To add an admin, append to `ADMIN_EMAILS` and restart. **Env changes need a server restart** — they're read at process start.

---

## 9. Authentication (Supabase)

Email/password auth via **Supabase Auth**; application data stays in local Prisma/SQLite. Supabase is used for identity only — no app tables live there.

- `src/lib/supabase/client.ts` (browser) and `server.ts` (server components + route handlers), both on `@supabase/ssr`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — both public by design.
- `src/server/auth.ts` — `getCurrentUser()` keeps the **same signature it had before** (local `User` row or null), which is why the ~24 routes and pages that guard on it needed no changes at all. It calls `supabase.auth.getUser()` (**not** `getSession()` — `getUser` revalidates the token with Supabase, while `getSession` trusts a cookie that is attacker-supplied input on the server), then finds-or-creates the local row by `supabaseUserId`.
- **The local row is created lazily on first read**, not at sign-up, because sign-up isn't the only path a first session can arrive by (a confirmation link, or a session restored on another device, both skip it). Creating it is also what triggers `seedDemoGame`, so the "your first game comes back analyzed" promise survives the auth change.
- `src/proxy.ts` does double duty: it gates non-public paths **and refreshes the Supabase token on every request**. That refresh is why it runs even for public paths — server components can't write cookies, so this is the only place a renewed token can be handed back. Two traps encoded there: the response object must be the one Supabase wrote cookies into (rebuilding it drops the refresh), and the redirect for signed-out users has to copy those cookies across or the refresh is lost.
- **`/signup` must stay in `PUBLIC_PREFIXES`** alongside `/login`, for the same reason as the landing page.
- Sign-out is a server route (`POST /api/auth/signout`) so cookies are cleared by the response.

### Google OAuth

- The provider is configured **entirely in the Supabase dashboard** (Authentication → Providers → Google, client id + secret from Google Cloud Console). The app only names the provider — **there is no Google client id or secret anywhere in this repo, by design.** Don't "helpfully" add one.
- `src/app/auth/callback/route.ts` exchanges the PKCE `code` for a session. It's a route handler rather than a page because route handlers can write cookies.
- **`/auth/callback` must stay in `PUBLIC_PREFIXES`.** The visitor isn't signed in when they arrive — they're carrying an unexchanged code — so gating it bounces them to `/login` and discards the code. The failure looks like Google rejecting the user, not like a routing bug.
- `next` is validated to be a same-origin path before redirecting, so the callback can't be used as an open redirect.
- Supabase's message for a stale or reused code is a paragraph about PKCE storage and SSR frameworks. It's logged, not shown; the user sees "That sign-in link has expired or was already used." Verified for cancelled consent, provider errors, missing code and invalid code.
- **Three URLs have to agree or the flow fails at the last step**: Google Cloud Console's authorized redirect URI is `https://<ref>.supabase.co/auth/v1/callback`; Supabase's *Redirect URLs* allowlist must contain `http://localhost:3000/auth/callback` and the production equivalent; anything not on that allowlist silently falls back to the Site URL, so sign-in appears to work but lands in the wrong place.
- A Google user hits the same `ensureLocalUser` path as an email user, so the demo game is seeded for them too.

**Observed in dev:** restarting the dev server reliably drops the browser's Supabase session. The likely cause is that the first request after a restart triggers a token refresh, and a failure there makes the SDK clear the auth cookies rather than retry. Harmless locally — sign in again — but worth remembering before chasing it as a bug, and worth watching if it ever shows up against a flaky network in production.

**Migration note:** this replaced password-less name login outright, by explicit decision. Pre-existing rows (`Om`, `Local Player`) are still in the dev database with their games, but have no `supabaseUserId` and are therefore unreachable — nobody can sign in as them. They are not a bug; deleting them is safe whenever you want the database tidy.

---

## 10. The Two-Layer Verdict, and What Counts as a Finding

Three changes that share one goal: a player should be able to review a whole game at the pace of a game, and everything they read should be worth reading.

### Only material tactics are reported

A tactic can be geometrically real and worth nothing. The dev database had **38 stored "skewers" and every one of them was noise** — variations on "the White queen on h5 attacks the Black pawn on g5, which must move and expose the Black pawn on d5 behind it". A queen does not force a defended pawn to move.

`src/server/explain/exchange.ts` adds a static exchange evaluation: play the cheapest legal capture onto a square, recurse for the recapture, clamp at zero because either side may stop. It enumerates **legal** moves, not geometric attackers, so a pinned attacker correctly threatens nothing. Each detector is now gated on it:

- **hanging piece** — undefended *and* actually winnable.
- **fork** — still needs two targets, but at least one has to be worth taking. Knight forking two defended rooks: reported. Knight forking two defended knights: dropped.
- **pin** — the pinned piece must be winnable now, or attackers must at least match defenders (a pinned piece can't run, so matching is enough to win it by piling on).
- **skewer** — the front piece must be under a real threat, and what's behind it must be worth a knight or more.
- Findings are capped at **three** per moment.

Measured over the whole dev DB, apples-to-apples through the same relevance filter: skewer 38 → 0, hanging 30 → 28, pin 8 → 7, fork 3 → 2, back-rank and king exposure unchanged (no material gate applies to them). Moments carrying at least one finding: 70 → 45. The detector is not dead — scanning all 6,462 stored positions still finds 10 skewers, all genuine piece-behind-piece shapes.

**If you loosen a gate, re-run that audit before believing the result.** The first version of the skewer gate counted the front piece as a defender of the piece behind it, which silently suppressed the single most common real skewer there is (a queen in front of a rook — the queen "defends" it right up until it has to run). Only the existing true-positive test caught it.

### The verdict is read in two layers

`StructuredExplanation` gained an optional `summary` of three short lines: `headline`, `betterMove`, `takeaway`. The reveal panel opens on those, beside the board, and puts the four detail cards, the eval numbers, the engine line and the concept list behind an **Explain more** button.

- **`summary` is optional purely for backwards compatibility** — explanations generated before this are stored as JSON on their reflection and can't gain fields. Always read it through `explanationSummary()` in `src/lib/explanation-summary.ts`, which derives one from the deep fields when it's missing, so the two cases are indistinguishable at the call site. Never read `explanation.summary` directly.
- The Claude provider **requires** the summary and throws without it, so a missing one takes the logged fallback path and shows up on `/admin/explanations` rather than being silently patched over. The prompt gained a two-layers section (with per-line word limits, and a ban on eval numbers in the summary) and a "cut whatever isn't load-bearing" section; all three worked examples now include a summary.
- The grounding check covers the summary too, addressed as `summary.headline` etc. When a summary line has to be replaced, `applyGrounding` **prefers the model's own surviving deep field** (headline ← `whatItMissed`, betterMove ← `whyBestIsBetter`, takeaway ← `remember`) over the template's generic line — that text passed the identical check, and the summary is the layer everyone reads. Verified live: a patched headline went from "Qc7 gave up a small amount of your advantage" to "Qc7 develops safely, but it skips the chance to trade off White's active knight on c3 with tempo."
- Splitting the layers costs nothing at runtime: the deep fields were always generated in the same call and are already on the client. Nobody is shown a shallower analysis, only a differently ordered one.

### The wait is now legible

Submitting a reflection runs a Stockfish evaluation and then a Claude call — often over ten seconds behind a button that just said "Revealing…". The reflect route now streams **newline-delimited JSON** stage events (`checking` → `explaining` → `saving` → `done`) as it reaches them, and the form shows a staged progress bar.

- Everything that can fail fast (validation, ownership, move legality, already-reviewed) still returns a normal JSON error with a status code. Past that point the response is committed to 200, so **later failures arrive as an error *event*, not a status** — `readRevealStream` in `src/lib/reveal-stream.ts` has to handle that or a failed reveal looks like a success with a missing verdict.
- Stage labels are ground truth from the server; only the movement between two announcements is estimated. Each stage eases toward a ceiling short of 100, so the bar can never sit at "done" while work is still running.
- `toClientView` is still the only serializer — streaming changed how the verdict reaches the client, not what the client may see.
- Verified with a temporary public route that Next 16 + Turbopack flushes each event as it's enqueued rather than buffering the response whole.
