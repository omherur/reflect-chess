import { cn } from "@/lib/utils";

/**
 * The ReflectChess mark, drawn as vector rather than shipped as the raster
 * original. Three reasons this had to be redrawn: the artwork is a black-
 * background PNG and the app's light theme is parchment, the header needs it
 * legible at 28px, and the "bright" half of the king has to change with the
 * theme (silver on the dark reading-room background, warm charcoal on
 * parchment) or it disappears against one of them. The halves read from the
 * --brand-gold and --brand-silver variables in globals.css, so both themes
 * are handled at the token level.
 *
 * `idPrefix` exists because gradient and clip ids are document-global: two
 * marks on one page (header + hero) need distinct ids. Keeping it a prop
 * rather than useId() keeps this a server component — it's a static drawing
 * and shouldn't cost the client any JavaScript.
 */

// The king, centered on x=50, standing on the board plane at y=79. Drawn once
// and rendered twice, clipped to each half, which is what produces the split.
const KING_BODY =
  "M47.5 18 h5 v4 h4.5 v4.5 h-4.5 v5.5 " + // the cross on top
  "C62 33.5 65.5 36.5 65.5 41 " + // crown, right side
  "C65.5 45.5 62.5 48.5 58.5 50 " +
  "C60.5 55 61.5 60.5 61 65 " + // torso taper
  "C60.7 68.5 62.5 71 66 73.5 " + // flare into the base
  "L68.5 75.5 L68.5 79 " +
  "L31.5 79 L31.5 75.5 L34 73.5 " + // base, left side
  "C37.5 71 39.3 68.5 39 65 " +
  "C38.5 60.5 39.5 55 41.5 50 " +
  "C37.5 48.5 34.5 45.5 34.5 41 " +
  "C34.5 36.5 38 33.5 47.5 32 " +
  "v-5.5 h-4.5 v-4.5 h4.5 v-4 Z";

function King() {
  return (
    <>
      <path d={KING_BODY} />
      {/* The two collar rings, sitting proud of the torso. */}
      <rect x="36" y="48.6" width="28" height="5.4" rx="2.7" />
      <rect x="38.8" y="55.4" width="22.4" height="3.4" rx="1.7" />
    </>
  );
}

/**
 * The perspective board plane the king stands on: four columns receding to a
 * narrower back edge, alternating filled and empty. Computed rather than
 * hand-written so the projection stays consistent.
 */
function BoardPlane({ fill }: { fill: string }) {
  // Two ranks receding to a narrower back edge. The king's base sits at
  // y=79, between them, so it reads as standing on the board rather than
  // in front of it.
  const rows = [
    { yTop: 74.5, wTop: 24, yBot: 80.5, wBot: 32 },
    { yTop: 80.5, wTop: 32, yBot: 88, wBot: 44 },
  ];
  const COLS = 6;
  const cols = Array.from({ length: COLS }, (_, c) => -1 + (2 * c) / COLS);

  return (
    <g fill={fill}>
      {rows.flatMap((row, r) =>
        cols.map((t1, c) => {
          // Checker pattern: fill only where row and column parities agree.
          if ((r + c) % 2 !== 0) return null;
          const t2 = t1 + 2 / COLS;
          const pts = [
            [50 + row.wTop * t1, row.yTop],
            [50 + row.wTop * t2, row.yTop],
            [50 + row.wBot * t2, row.yBot],
            [50 + row.wBot * t1, row.yBot],
          ];
          return (
            <polygon key={`${r}-${c}`} points={pts.map(([x, y]) => `${x},${y}`).join(" ")} />
          );
        })
      )}
    </g>
  );
}

function BrandDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand-gold-1)" />
        <stop offset="55%" stopColor="var(--brand-gold-2)" />
        <stop offset="100%" stopColor="var(--brand-gold-3)" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-silver`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand-silver-1)" />
        <stop offset="55%" stopColor="var(--brand-silver-2)" />
        <stop offset="100%" stopColor="var(--brand-silver-3)" />
      </linearGradient>
      <clipPath id={`${idPrefix}-half-left`}>
        <rect x="0" y="0" width="50" height="200" />
      </clipPath>
      <clipPath id={`${idPrefix}-half-right`}>
        <rect x="50" y="0" width="50" height="200" />
      </clipPath>
      {/* The reflection fades as it falls away from the board — fully gone
          before the bottom of the viewBox, so it ends rather than clips. */}
      <linearGradient id={`${idPrefix}-fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity="0.55" />
        <stop offset="45%" stopColor="white" stopOpacity="0.18" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <mask id={`${idPrefix}-reflection-mask`} maskUnits="userSpaceOnUse" x="0" y="88" width="100" height="60">
        <rect x="0" y="88" width="100" height="58" fill={`url(#${idPrefix}-fade)`} />
      </mask>
    </defs>
  );
}

/**
 * Icon-only mark: the split king inside its open arc. This is the version for
 * the header, favicon, and anywhere the wordmark is already present as text.
 */
export function LogoMark({
  className,
  idPrefix = "rc-mark",
}: {
  className?: string;
  idPrefix?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 92"
      className={cn("size-7", className)}
      role="img"
      aria-label="ReflectChess"
    >
      <BrandDefs idPrefix={idPrefix} />

      {/* The arc, open at the bottom with a hairline gap at the top. */}
      <path
        d="M49 11 A34 34 0 0 0 20 70"
        fill="none"
        stroke={`url(#${idPrefix}-gold)`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M51 11 A34 34 0 0 1 80 70"
        fill="none"
        stroke={`url(#${idPrefix}-silver)`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      <g clipPath={`url(#${idPrefix}-half-left)`} fill={`url(#${idPrefix}-gold)`}>
        <King />
      </g>
      <g clipPath={`url(#${idPrefix}-half-right)`} fill={`url(#${idPrefix}-silver)`}>
        <King />
      </g>
    </svg>
  );
}

/**
 * The full lockup — mark, board, reflection — for the landing hero. The
 * reflection is the point of the name, so it only appears at a size where
 * it's actually legible.
 */
export function LogoFigure({
  className,
  idPrefix = "rc-figure",
}: {
  className?: string;
  idPrefix?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 148"
      className={cn("h-44 w-auto", className)}
      role="img"
      aria-label="ReflectChess"
    >
      <BrandDefs idPrefix={idPrefix} />

      <path
        d="M49 11 A34 34 0 0 0 20 70"
        fill="none"
        stroke={`url(#${idPrefix}-gold)`}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M51 11 A34 34 0 0 1 80 70"
        fill="none"
        stroke={`url(#${idPrefix}-silver)`}
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Reflection first, so the piece itself sits on top of the board. The
          mask and the mirroring transform have to live on separate elements:
          on one element they share a coordinate system, so the fade gets
          flipped along with the king and lands on the wrong half. */}
      <g mask={`url(#${idPrefix}-reflection-mask)`}>
        <g transform="translate(0 176) scale(1 -1)">
          <g clipPath={`url(#${idPrefix}-half-left)`} fill={`url(#${idPrefix}-gold)`}>
            <King />
          </g>
          <g clipPath={`url(#${idPrefix}-half-right)`} fill={`url(#${idPrefix}-silver)`}>
            <King />
          </g>
        </g>
      </g>

      <g opacity="0.4">
        <g clipPath={`url(#${idPrefix}-half-left)`}>
          <BoardPlane fill="var(--brand-gold-3)" />
        </g>
        <g clipPath={`url(#${idPrefix}-half-right)`}>
          <BoardPlane fill="var(--brand-silver-3)" />
        </g>
      </g>

      <g clipPath={`url(#${idPrefix}-half-left)`} fill={`url(#${idPrefix}-gold)`}>
        <King />
      </g>
      <g clipPath={`url(#${idPrefix}-half-right)`} fill={`url(#${idPrefix}-silver)`}>
        <King />
      </g>
    </svg>
  );
}

/**
 * The wordmark as HTML rather than SVG text — it stays selectable, scales
 * with the type scale, and inherits the app's font stack. Split-colored the
 * same way the king is.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-sans text-2xl font-light tracking-[0.3em] whitespace-nowrap sm:text-3xl",
        className
      )}
    >
      <span className="text-[var(--brand-gold-2)]">REFLECT</span>
      <span className="text-[var(--brand-silver-2)]">CHESS</span>
    </span>
  );
}
