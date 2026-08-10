import { spawn, type ChildProcess } from "child_process";
import path from "path";
import readline from "readline";
import { Chess } from "chess.js";
import { prisma } from "@/lib/db";
import { sideToMove } from "@/lib/chess/pgn";
import { terminalMateScore, toWhitePerspective } from "@/lib/chess/eval";
import type { Score } from "@/lib/types";

export interface EngineLine {
  multipv: number;
  /** Score from the side to move's perspective (raw UCI convention). */
  score: Score;
  depth: number;
  pvUci: string[];
}

export interface EngineResult {
  /** Null when the position is already checkmate/stalemate. */
  bestmoveUci: string | null;
  lines: EngineLine[];
  /** Terminal state of the position, if any. */
  terminal: "checkmate" | "stalemate" | null;
}

export interface AnalyzeOptions {
  depth: number;
  multiPv: number;
}

export class EngineError extends Error {}

const ENGINE_TIMEOUT_MS = 60_000;

/**
 * UCI client over a spawned Stockfish WASM child process. Requests are
 * serialized through a queue; results are cached in SQLite by FEN+settings.
 * Kept as a lazy global singleton so dev-server HMR doesn't leak processes.
 */
class StockfishService {
  private proc: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lineHandler: ((line: string) => void) | null = null;

  private async ensureStarted(): Promise<void> {
    if (this.ready && this.proc && this.proc.exitCode === null) return this.ready;

    const runnerPath = path.join(process.cwd(), "src", "server", "engine", "runner.cjs");
    const proc = spawn(process.execPath, [runnerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    this.proc = proc;

    const rl = readline.createInterface({ input: proc.stdout! });
    rl.on("line", (line) => this.lineHandler?.(line));
    proc.stderr!.on("data", (d) => {
      console.error("[stockfish]", String(d).trim());
    });
    proc.on("exit", () => {
      this.proc = null;
      this.ready = null;
    });

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new EngineError("Engine failed to start in time.")),
        ENGINE_TIMEOUT_MS
      );
      this.lineHandler = (line) => {
        if (line === "__engine_ready__") {
          clearTimeout(timer);
          this.lineHandler = null;
          resolve();
        }
      };
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(new EngineError(`Engine process error: ${err.message}`));
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        reject(new EngineError(`Engine exited during startup (code ${code}).`));
      });
    });

    await this.ready;
    await this.exclusive(() => this.send(["uci"], "uciok"));
  }

  private send(commands: string[], waitFor: string): Promise<string[]> {
    const proc = this.proc;
    if (!proc?.stdin) return Promise.reject(new EngineError("Engine not running."));
    return new Promise((resolve, reject) => {
      const lines: string[] = [];
      const timer = setTimeout(() => {
        this.lineHandler = null;
        reject(new EngineError(`Engine timed out waiting for "${waitFor}".`));
      }, ENGINE_TIMEOUT_MS);
      this.lineHandler = (line) => {
        lines.push(line);
        if (line === waitFor || line.startsWith(waitFor + " ")) {
          clearTimeout(timer);
          this.lineHandler = null;
          resolve(lines);
        }
      };
      for (const cmd of commands) proc.stdin!.write(cmd + "\n");
    });
  }

  /** Serialize engine interactions — one search at a time. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Analyze a FEN to the given depth. Scores in the result follow the UCI
   * convention: from the perspective of the side to move in `fen`.
   */
  async analyze(fen: string, options: AnalyzeOptions): Promise<EngineResult> {
    // Terminal positions: the engine has nothing to search.
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return { bestmoveUci: null, lines: [], terminal: "checkmate" };
    if (chess.isStalemate() || chess.isDraw()) {
      return { bestmoveUci: null, lines: [], terminal: "stalemate" };
    }

    await this.ensureStarted();
    return this.exclusive(async () => {
      await this.send(["isready"], "readyok");
      const output = await this.send(
        [
          `setoption name MultiPV value ${options.multiPv}`,
          "ucinewgame",
          `position fen ${fen}`,
          `go depth ${options.depth}`,
        ],
        "bestmove"
      );
      return parseEngineOutput(output, options.multiPv);
    });
  }

  stop(): void {
    this.proc?.stdin?.write("__quit__\n");
    this.proc = null;
    this.ready = null;
  }
}

/** Parse UCI `info ... multipv ... score ... pv ...` lines plus bestmove. */
export function parseEngineOutput(lines: string[], multiPv: number): EngineResult {
  const best: Map<number, EngineLine> = new Map();
  for (const line of lines) {
    if (!line.startsWith("info ") || !line.includes(" pv ")) continue;
    if (line.includes("lowerbound") || line.includes("upperbound")) continue;
    const depthM = / depth (\d+)/.exec(line);
    const mpvM = / multipv (\d+)/.exec(line);
    const cpM = / score cp (-?\d+)/.exec(line);
    const mateM = / score mate (-?\d+)/.exec(line);
    const pvM = / pv (.+)$/.exec(line);
    if (!depthM || !pvM || (!cpM && !mateM)) continue;
    const entry: EngineLine = {
      multipv: mpvM ? parseInt(mpvM[1], 10) : 1,
      depth: parseInt(depthM[1], 10),
      score: mateM ? { mate: parseInt(mateM[1], 10) } : { cp: parseInt(cpM![1], 10) },
      pvUci: pvM[1].trim().split(/\s+/),
    };
    const prev = best.get(entry.multipv);
    if (!prev || entry.depth >= prev.depth) best.set(entry.multipv, entry);
  }

  const bestmoveLine = lines.find((l) => l.startsWith("bestmove"));
  const bestmove = bestmoveLine?.split(/\s+/)[1];
  return {
    bestmoveUci: bestmove && bestmove !== "(none)" ? bestmove : null,
    lines: [...best.values()].sort((a, b) => a.multipv - b.multipv).slice(0, multiPv),
    terminal: null,
  };
}

const globalForEngine = globalThis as unknown as { stockfish?: StockfishService };
export const stockfish = globalForEngine.stockfish ?? new StockfishService();
if (process.env.NODE_ENV !== "production") globalForEngine.stockfish = stockfish;

function settingsKey(options: AnalyzeOptions): string {
  return `d${options.depth}mpv${options.multiPv}`;
}

/**
 * Cached analysis. Results are stored in SQLite keyed by (fen, settings),
 * so re-analyzing a game or shared positions never repeats engine work.
 */
export async function analyzeCached(
  fen: string,
  options: AnalyzeOptions
): Promise<EngineResult> {
  const settings = settingsKey(options);
  const cached = await prisma.analysisCache.findUnique({
    where: { fen_settings: { fen, settings } },
  });
  if (cached) return JSON.parse(cached.result) as EngineResult;

  const result = await stockfish.analyze(fen, options);
  await prisma.analysisCache.upsert({
    where: { fen_settings: { fen, settings } },
    create: { fen, settings, result: JSON.stringify(result) },
    update: { result: JSON.stringify(result) },
  });
  return result;
}

/**
 * Convenience: evaluation of a position from White's perspective, using the
 * top engine line. Terminal positions get definitive scores.
 */
export function resultToWhiteScore(result: EngineResult, fen: string): Score {
  if (result.terminal === "checkmate") {
    // The side to move is checkmated, so the other side won.
    return terminalMateScore(sideToMove(fen) === "white" ? "black" : "white");
  }
  if (result.terminal === "stalemate") return { cp: 0 };
  const top = result.lines.find((l) => l.multipv === 1) ?? result.lines[0];
  if (!top) return { cp: 0 };
  return toWhitePerspective(top.score, sideToMove(fen));
}
