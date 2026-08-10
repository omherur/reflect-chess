const PIECE_GLYPH: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function parseBoard(fen: string): (string | null)[][] {
  const placement = fen.split(" ")[0];
  return placement.split("/").map((rank) => {
    const row: (string | null)[] = [];
    for (const ch of rank) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    return row;
  });
}

interface MiniBoardProps {
  fen: string;
  from?: string;
  to?: string;
  orientation?: "white" | "black";
  size?: number;
}

/**
 * A small, static (non-interactive) board snapshot — deliberately lighter
 * weight than the full interactive react-chessboard, since a dashboard can
 * render many of these at once. Shows historical fact only (position +
 * move played), same as the rest of the pre-reveal app: no color-coding by
 * classification or severity.
 */
export function MiniBoard({ fen, from, to, orientation = "white", size = 96 }: MiniBoardProps) {
  const rows = parseBoard(fen);
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const displayRows = orientation === "white" ? rows : [...rows].reverse();
  const cell = size / 8;

  return (
    <div
      className="grid overflow-hidden rounded-md ring-1 ring-stone-200"
      style={{ width: size, height: size, gridTemplateColumns: `repeat(8, ${cell}px)` }}
    >
      {displayRows.map((row, rIdx) => {
        const displayCols = orientation === "white" ? row : [...row].reverse();
        const rank = orientation === "white" ? 8 - rIdx : rIdx + 1;
        return displayCols.map((piece, cIdx) => {
          const file = orientation === "white" ? files[cIdx] : files[7 - cIdx];
          const square = `${file}${rank}`;
          const isDark = (rIdx + cIdx) % 2 === 1;
          const isMoveSquare = square === from || square === to;
          return (
            <div
              key={square}
              className="flex items-center justify-center"
              style={{
                width: cell,
                height: cell,
                fontSize: cell * 0.75,
                lineHeight: 1,
                backgroundColor: isMoveSquare
                  ? "rgba(217, 119, 6, 0.35)"
                  : isDark
                    ? "#8b7355"
                    : "#f0dfc4",
                color: piece && piece === piece.toUpperCase() ? "#fff" : "#1c1917",
                textShadow: piece && piece === piece.toUpperCase() ? "0 0 1.5px #000, 0 0 1px #000" : "none",
              }}
            >
              {piece ? PIECE_GLYPH[piece] : ""}
            </div>
          );
        });
      })}
    </div>
  );
}
