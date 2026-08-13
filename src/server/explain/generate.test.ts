import { describe, it, expect, vi } from "vitest";
import { TemplateExplanationProvider } from "./generate";
import { FallbackExplanationProvider } from "./fallback-provider";
import { buildUserPrompt, parseResponse, SYSTEM_PROMPT, validateWalkthrough } from "./claude-provider";
import type { ExplainInput, ExplanationProvider } from "./types";
import type { ConceptHighlight, StructuredExplanation } from "@/lib/types";

const HANGING_PIECE: ConceptHighlight = {
  concept: "hanging piece",
  note: "White queen on d1 is undefended and can be captured",
  squares: ["d1"],
};

/** A response with every field the parser requires, to vary one at a time. */
const VALID_RESPONSE = {
  summary: { headline: "h", betterMove: "b", takeaway: "t" },
  whatYourMoveDid: "a",
  whatItMissed: "b",
  whyBestIsBetter: "c",
  remember: "d",
  replayNote: "e",
};

const BASE_INPUT: ExplainInput = {
  fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  originalSan: "Bxd1",
  originalUci: "g4d1",
  bestSan: "dxe5",
  bestUci: "d6e5",
  classification: "BLUNDER",
  moverColor: "black",
  evalBeforeMover: { cp: -150 },
  evalAfterMover: { mate: -2 },
  principalVariationSan: ["dxe5", "Qxg4"],
  conceptHighlights: [HANGING_PIECE],
  userThoughts: "I thought I was winning the queen for free.",
  replaySan: "dxe5",
  replayUci: "d6e5",
  replaySame: false,
  evalAfterReplayMover: { cp: -170 },
  replayVerdict: "IMPROVEMENT",
  replayConceptHighlights: [],
  clockSecondsAtMove: null,
};

describe("TemplateExplanationProvider", () => {
  const provider = new TemplateExplanationProvider();

  it("produces all four sections plus a replay note", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    expect(result.whatYourMoveDid).toContain("Bxd1");
    expect(result.whatItMissed.length).toBeGreaterThan(0);
    expect(result.whyBestIsBetter).toContain("dxe5");
    expect(result.remember.length).toBeGreaterThan(0);
    expect(result.replayNote).toContain("dxe5");
    expect(result.concepts).toEqual(["hanging piece"]);
  });

  it("produces a summary layer that names the concrete thing, not just a verdict", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    const summary = result.summary;
    expect(summary).toBeDefined();
    // The headline has to carry the actual finding — the square and the
    // fact — since a player who reads only this layer gets nothing from
    // "this was a blunder".
    expect(summary?.headline).toContain("d1");
    expect(summary?.headline).toContain("undefended");
    expect(summary?.betterMove).toContain("dxe5");
    expect(summary?.takeaway?.length).toBeGreaterThan(0);
  });

  it("keeps the summary short enough to scan", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    const summary = result.summary!;
    // Roughly the three lines' word limits from the prompt. This is the
    // whole point of the layer — if it grows to paragraph length the fast
    // review path is gone.
    expect(summary.headline.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(summary.betterMove.split(/\s+/).length).toBeLessThanOrEqual(35);
    expect(summary.takeaway.split(/\s+/).length).toBeLessThanOrEqual(30);
  });

  it("never puts an evaluation number in the summary", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    const summary = result.summary!;
    const joined = `${summary.headline} ${summary.betterMove} ${summary.takeaway}`;
    expect(joined).not.toMatch(/engine:/i);
    expect(joined).not.toMatch(/[+-]\d+\.\d/);
  });

  it("grounds 'what it missed' in the concrete note and square, not just the bare tag", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    expect(result.whatItMissed).toContain("undefended");
    expect(result.whatItMissed).toContain("d1");
    expect(result.whatItMissed).not.toBe("It missed that hanging piece.");
  });

  it("never states the eval difference as the headline reason in whyBestIsBetter", async () => {
    const result = await provider.explainMove(BASE_INPUT);
    expect(result.whyBestIsBetter).not.toMatch(/^dxe5 keeps the evaluation/i);
    // the eval, if present at all, should only appear in a trailing "(engine: ...)" note
    if (/engine:/.test(result.whyBestIsBetter)) {
      expect(result.whyBestIsBetter).toMatch(/\(engine: .*\)\.?$/);
    }
  });

  it("REGRESSION: never asserts improvement without a mechanism, even with no concepts and no PV", async () => {
    // The exact reported symptom: the same generic sentence verbatim across
    // unrelated positions when there's nothing concrete to lean on.
    const result = await provider.explainMove({
      ...BASE_INPUT,
      conceptHighlights: [],
      principalVariationSan: [],
    });
    expect(result.whyBestIsBetter).not.toMatch(/addresses the (concrete )?problem/i);
    expect(result.whyBestIsBetter).not.toMatch(/instead of leaving it standing/i);
    // Still grounded in a real practical comparison, not just an assertion.
    expect(result.whyBestIsBetter).toContain(BASE_INPUT.bestSan);
    expect(result.whyBestIsBetter).toContain(BASE_INPUT.originalSan);
  });

  it("REGRESSION: never uses the exact reported banned wrapper phrase, for any classification", async () => {
    // The literal phrase reported: "X would have kept the position at a
    // point where ... rather than where Y actually left it" — substituting
    // different moves/evals but otherwise identical across positions.
    for (const classification of ["INACCURACY", "MISTAKE", "BLUNDER", "MISSED_OPPORTUNITY"] as const) {
      const result = await provider.explainMove({ ...BASE_INPUT, classification, conceptHighlights: [] });
      expect(result.whyBestIsBetter).not.toMatch(/would have kept the position at a point where/i);
    }
  });

  it("names an underlying chess principle when there's no tactical concept to point to (quiet/minor moments)", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "INACCURACY",
      conceptHighlights: [],
      bestSan: "d5",
      bestUci: "d7d5", // central destination square -> should infer "center control"
    });
    expect(result.whyBestIsBetter).toMatch(/this is about center control/i);
  });

  it("REGRESSION: never doubles up 'you' when describing the resulting position (e.g. 'left you you are')", async () => {
    // describeScore() already returns a full clause starting with "you
    // are"/"your opponent"/"you have" — a sentence template that says
    // "left you <clause>" produces "left you you are clearly worse".
    for (const evalAfterMover of [{ cp: -150 }, { cp: 150 }, { mate: -2 }, { mate: 3 }]) {
      const result = await provider.explainMove({ ...BASE_INPUT, conceptHighlights: [], evalAfterMover });
      expect(result.whyBestIsBetter).not.toMatch(/you you are|you your opponent|you you have/i);
    }
  });

  it("names king safety as the principle when the best move castles", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "MISTAKE",
      conceptHighlights: [],
      bestSan: "O-O",
      bestUci: "e1g1",
    });
    expect(result.whyBestIsBetter).toMatch(/this is about king safety/i);
  });

  it("names piece development as the principle when the best move brings a piece off the back rank", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "INACCURACY",
      conceptHighlights: [],
      bestSan: "Nf3",
      bestUci: "g1f3",
    });
    expect(result.whyBestIsBetter).toMatch(/this is about piece development/i);
  });

  it("a detected tactical concept still takes priority over the geometric principle guess", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "BLUNDER",
      conceptHighlights: [HANGING_PIECE],
      bestSan: "d5", // would otherwise infer "center control" from the destination square
      bestUci: "d7d5",
    });
    expect(result.whyBestIsBetter).toMatch(/this is about material safety/i);
  });

  it("marks BEST/GOOD moves as not approximate", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "BEST",
      conceptHighlights: [],
    });
    expect(result.approximate).toBe(false);
  });

  it("marks a mistake with no detected concepts as approximate", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "MISTAKE",
      conceptHighlights: [],
    });
    expect(result.approximate).toBe(true);
  });

  it("describes a same-as-original replay distinctly", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      replayVerdict: "SAME_AS_ORIGINAL",
      replaySame: true,
      replaySan: "Bxd1",
    });
    expect(result.replayNote).toMatch(/same move/i);
  });

  it("gives a concrete reason (not just 'worth another look') when the replay is worse", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      replayVerdict: "WORSE",
      replaySan: "Nd4",
      replayUci: "c6d4",
      replayConceptHighlights: [
        { concept: "hanging piece", note: "a piece is left undefended and can be captured", squares: ["d4"] },
      ],
    });
    expect(result.replayNote).not.toMatch(/worth another look/i);
    expect(result.replayNote).toContain("d4");
    expect(result.replayNote).toContain("dxe5"); // names the engine's best move for comparison
  });

  it("explicitly celebrates when the replay matches the engine's best move", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      replayVerdict: "SAME_AS_BEST",
      replaySan: "dxe5",
      replayUci: "d6e5",
    });
    expect(result.replayNote).toMatch(/you found it/i);
    expect(result.replayNote).toContain("dxe5");
  });

  it("explicitly acknowledges a genuine improvement, and notes when it still falls short of the engine's best", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      replayVerdict: "IMPROVEMENT",
      replaySan: "Nf6",
      replayUci: "g8f6",
      bestSan: "dxe5",
    });
    expect(result.replayNote).toMatch(/genuine improvement/i);
    expect(result.replayNote).toContain("Nf6");
    expect(result.replayNote).toContain(BASE_INPUT.originalSan);
    // Honest about the gap to the engine's actual best move, since Nf6 !== dxe5.
    expect(result.replayNote).toMatch(/doesn't fully solve/i);
    expect(result.replayNote).toContain("dxe5");
  });

  it("doesn't claim a gap to 'best' when the improvement IS the engine's best move reached via a different verdict path", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      replayVerdict: "IMPROVEMENT",
      replaySan: "dxe5",
      replayUci: "d6e5",
      bestSan: "dxe5",
    });
    expect(result.replayNote).not.toMatch(/doesn't fully solve/i);
  });

  it("gives a dedicated time-management explanation for TIME_TROUBLE, not a tactical verdict", async () => {
    const result = await provider.explainMove({
      ...BASE_INPUT,
      classification: "TIME_TROUBLE",
      clockSecondsAtMove: 4,
    });
    expect(result.whatYourMoveDid).toContain("4s");
    expect(result.remember.toLowerCase()).toContain("clock");
    expect(result.approximate).toBe(false);
  });

  it("distinguishes time pressure from miscalculation when clock is low but classification is normal", async () => {
    const rushed = await provider.explainMove({ ...BASE_INPUT, clockSecondsAtMove: 5 });
    const notRushed = await provider.explainMove({ ...BASE_INPUT, clockSecondsAtMove: 120 });
    expect(rushed.remember).toMatch(/time pressure/i);
    expect(notRushed.remember).not.toMatch(/time pressure/i);
  });

  it("does not mention time pressure when no clock data is available", async () => {
    const result = await provider.explainMove({ ...BASE_INPUT, clockSecondsAtMove: null });
    expect(result.remember).not.toMatch(/time pressure/i);
  });
});

describe("generateExplanation — fallback visibility", () => {
  it("logs a warning on every call when no API key is configured, not just once", async () => {
    vi.resetModules();
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { generateExplanation } = await import("./generate");
      await generateExplanation(BASE_INPUT);
      await generateExplanation(BASE_INPUT);
      const noKeyWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("No ANTHROPIC_API_KEY configured")
      );
      expect(noKeyWarnings.length).toBe(2);
    } finally {
      warnSpy.mockRestore();
      if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
      vi.resetModules();
    }
  });
});

describe("FallbackExplanationProvider", () => {
  const good: StructuredExplanation = {
    whatYourMoveDid: "primary",
    whatItMissed: "primary",
    whyBestIsBetter: "primary",
    remember: "primary",
    replayNote: "primary",
    concepts: [],
    approximate: false,
  };
  const fallbackResult: StructuredExplanation = { ...good, whatYourMoveDid: "fallback" };

  it("uses the primary provider when it succeeds", async () => {
    const primary: ExplanationProvider = { explainMove: vi.fn().mockResolvedValue(good) };
    const fallback: ExplanationProvider = { explainMove: vi.fn().mockResolvedValue(fallbackResult) };
    const provider = new FallbackExplanationProvider(primary, fallback);

    const result = await provider.explainMove(BASE_INPUT);
    expect(result.whatYourMoveDid).toBe("primary");
    expect(fallback.explainMove).not.toHaveBeenCalled();
  });

  it("falls back when the primary provider throws (e.g. API failure or timeout)", async () => {
    const primary: ExplanationProvider = {
      explainMove: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const fallback: ExplanationProvider = { explainMove: vi.fn().mockResolvedValue(fallbackResult) };
    const provider = new FallbackExplanationProvider(primary, fallback);

    const result = await provider.explainMove(BASE_INPUT);
    expect(result.whatYourMoveDid).toBe("fallback");
  });
});

describe("Claude system prompt — mechanism requirement", () => {
  it("explicitly bans asserting improvement without explaining the mechanism", () => {
    expect(SYSTEM_PROMPT).toMatch(/NEVER ASSERT IMPROVEMENT WITHOUT EXPLAINING THE MECHANISM/i);
    expect(SYSTEM_PROMPT).toContain("addresses the problem");
  });

  it("applies the mechanism rule to all four fields, not just whyBestIsBetter", () => {
    expect(SYSTEM_PROMPT).toMatch(/whatYourMoveDid[\s\S]*whatItMissed[\s\S]*whyBestIsBetter[\s\S]*remember/);
  });

  it("includes a bad/good example pair for the mechanism rule", () => {
    const section = SYSTEM_PROMPT.split("NEVER ASSERT IMPROVEMENT")[1];
    expect(section).toMatch(/BAD \(never write like this\)/);
    expect(section).toMatch(/GOOD:/);
  });
});

describe("Claude system prompt — the two-layer requirement", () => {
  it("tells the model the summary is read first and must stand on its own", () => {
    expect(SYSTEM_PROMPT).toMatch(/TWO LAYERS/i);
    expect(SYSTEM_PROMPT).toMatch(/SELF-SUFFICIENT/i);
    expect(SYSTEM_PROMPT).toMatch(/Explain more/i);
  });

  it("gives each summary line an explicit length limit", () => {
    const section = SYSTEM_PROMPT.split("TWO LAYERS")[1];
    for (const line of ["headline", "betterMove", "takeaway"]) {
      expect(section).toContain(`"${line}"`);
    }
    expect(section).toMatch(/25 words maximum/);
    expect(section).toMatch(/15 words maximum/);
  });

  it("bans the eval number from the summary outright, not just as a headline reason", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never put an evaluation number anywhere in the summary/i);
  });

  it("tells the model to drop true-but-immaterial facts rather than pad with them", () => {
    expect(SYSTEM_PROMPT).toMatch(/CUT WHATEVER ISN'T LOAD-BEARING/i);
    expect(SYSTEM_PROMPT).toMatch(/adequately defended/i);
    expect(SYSTEM_PROMPT).toMatch(/better to say one thing that matters/i);
  });

  it("shows a summary in every worked example, so the standard is demonstrated not just stated", () => {
    // Each worked example is one JSON object opening with a summary. If an
    // example is ever added without one, the model is being shown a shape
    // the parser will reject.
    const examples = SYSTEM_PROMPT.split('"whatYourMoveDid":').length - 1;
    const summaries = SYSTEM_PROMPT.split('"summary": {').length - 1;
    expect(examples).toBeGreaterThanOrEqual(3);
    // Both counts include the one mention in the OUTPUT FORMAT spec.
    expect(summaries).toBe(examples - 1);
  });
});

describe("Claude system prompt — underlying principle requirement", () => {
  it("requires naming a chess principle in whyBestIsBetter, with a fixed vocabulary", () => {
    expect(SYSTEM_PROMPT).toMatch(/NAME THE UNDERLYING CHESS PRINCIPLE/i);
    for (const principle of ["center control", "king safety", "piece activity", "weak squares"]) {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain(principle);
    }
  });

  it("says this matters most for minor/non-obvious moments with no tactic to point to", () => {
    const section = SYSTEM_PROMPT.split("NAME THE UNDERLYING CHESS PRINCIPLE")[1]?.split("##")[0] ?? "";
    expect(section).toMatch(/minor|non-obvious|quiet/i);
  });

  it("requires replayNote to explicitly acknowledge an improvement and celebrate matching the engine's best move", () => {
    expect(SYSTEM_PROMPT).toMatch(/explicitly acknowledge it as a real improvement/i);
    expect(SYSTEM_PROMPT).toMatch(/explicitly and warmly celebrate/i);
  });

  it("includes a worked example for the IMPROVEMENT verdict, not just SAME_AS_BEST and WORSE", () => {
    expect(SYSTEM_PROMPT).toMatch(/verdict IMPROVEMENT/);
  });
});

describe("Claude provider prompt + response parsing", () => {
  it("includes the key facts the coach needs in the prompt", () => {
    const prompt = buildUserPrompt(BASE_INPUT);
    expect(prompt).toContain(BASE_INPUT.fenBefore);
    expect(prompt).toContain("Bxd1");
    expect(prompt).toContain("dxe5");
    expect(prompt).toContain("BLUNDER");
    expect(prompt).toContain(BASE_INPUT.userThoughts);
    expect(prompt).toContain("hanging piece");
    expect(prompt).toContain("d1");
    expect(prompt).toContain("IMPROVEMENT");
  });

  it("notes when the player would replay the same move", () => {
    const prompt = buildUserPrompt({ ...BASE_INPUT, replaySame: true });
    expect(prompt).toMatch(/SAME move again/);
  });

  it("includes clock data in the prompt when available", () => {
    const withClock = buildUserPrompt({ ...BASE_INPUT, clockSecondsAtMove: 7 });
    expect(withClock).toContain("7s remaining");
    const withoutClock = buildUserPrompt({ ...BASE_INPUT, clockSecondsAtMove: null });
    expect(withoutClock).toContain("not available");
  });

  it("adds an explicit grounding instruction when the replay verdict is WORSE or SIMILAR", () => {
    const worse = buildUserPrompt({ ...BASE_INPUT, replayVerdict: "WORSE" });
    expect(worse).toMatch(/IMPORTANT[\s\S]*did NOT actually fix/i);
    const similar = buildUserPrompt({ ...BASE_INPUT, replayVerdict: "SIMILAR" });
    expect(similar).toMatch(/IMPORTANT[\s\S]*did NOT actually fix/i);
    const improvement = buildUserPrompt({ ...BASE_INPUT, replayVerdict: "IMPROVEMENT" });
    expect(improvement).not.toMatch(/IMPORTANT/);
  });

  it("parses a clean JSON response", () => {
    const parsed = parseResponse(JSON.stringify(VALID_RESPONSE));
    expect(parsed.whatYourMoveDid).toBe("a");
    expect(parsed.replayNote).toBe("e");
    expect(parsed.summary.headline).toBe("h");
  });

  it("strips markdown code fences before parsing", () => {
    const text = "```json\n" + JSON.stringify(VALID_RESPONSE) + "\n```";
    const parsed = parseResponse(text);
    expect(parsed.whatYourMoveDid).toBe("a");
  });

  it("throws when a required field is missing", () => {
    expect(() =>
      parseResponse(JSON.stringify({ whatYourMoveDid: "a", whatItMissed: "b" }))
    ).toThrow();
  });

  it("throws when a required field is empty", () => {
    expect(() =>
      parseResponse(JSON.stringify({ ...VALID_RESPONSE, whatYourMoveDid: "" }))
    ).toThrow();
  });

  it("throws when the summary layer is missing entirely", () => {
    // The summary is what nearly every player reads, so a response without
    // one goes down the logged fallback path rather than being silently
    // patched up from the detail fields.
    const withoutSummary: Record<string, unknown> = { ...VALID_RESPONSE };
    delete withoutSummary.summary;
    expect(() => parseResponse(JSON.stringify(withoutSummary))).toThrow(/summary/);
  });

  it("throws when a summary line is empty", () => {
    expect(() =>
      parseResponse(
        JSON.stringify({ ...VALID_RESPONSE, summary: { ...VALID_RESPONSE.summary, takeaway: "" } })
      )
    ).toThrow(/summary\.takeaway/);
  });

  it("throws on malformed JSON so the caller can fall back", () => {
    expect(() => parseResponse("not json at all")).toThrow();
  });
});

describe("validateWalkthrough", () => {
  const PV = ["Nd7", "Qxd5", "a6", "Nc3", "c6", "Qd3"];
  const steps = (moves: string[]) => moves.map((move) => ({ move, note: "does something useful" }));

  it("accepts steps that match the engine's line from its first move", () => {
    expect(validateWalkthrough(steps(["Nd7", "Qxd5", "a6"]), PV)).toEqual([
      { move: "Nd7", note: "does something useful" },
      { move: "Qxd5", note: "does something useful" },
      { move: "a6", note: "does something useful" },
    ]);
  });

  it("discards the whole walkthrough when a move isn't the engine's", () => {
    // The failure this guards against is the worst one available here:
    // an annotated line that reads as the engine's recommendation while
    // containing a move the engine never gave. Half-trustworthy is worse
    // than plain notation, so nothing is shown at all.
    expect(validateWalkthrough(steps(["Nd7", "Qxd4", "a6"]), PV)).toBeUndefined();
  });

  it("discards it when moves are skipped or reordered", () => {
    expect(validateWalkthrough(steps(["Nd7", "a6"]), PV)).toBeUndefined();
    expect(validateWalkthrough(steps(["Qxd5", "Nd7"]), PV)).toBeUndefined();
  });

  it("caps the number of steps so the line stays glanceable", () => {
    const longPv = [...PV, "Nxe5", "Qxd8+"];
    expect(validateWalkthrough(steps(longPv), longPv)).toHaveLength(6);
  });

  it("goes far enough to include the move that pays for a concession", () => {
    // The whole point of this line is c6, the fifth move, which hits the
    // queen and the knight together. A cap that stopped at four would show
    // the player a pawn being given away and never explain why.
    const walked = validateWalkthrough(steps(PV), PV);
    expect(walked?.map((s) => s.move)).toContain("c6");
  });

  it("rejects malformed or empty entries rather than rendering blanks", () => {
    expect(validateWalkthrough([{ move: "Nd7", note: "  " }, { move: "Qxd5", note: "x" }], PV)).toBeUndefined();
    expect(validateWalkthrough([{ move: "Nd7" }, { move: "Qxd5" }], PV)).toBeUndefined();
    expect(validateWalkthrough("Nd7 Qxd5", PV)).toBeUndefined();
    expect(validateWalkthrough([], PV)).toBeUndefined();
  });

  it("needs at least two moves to be worth showing", () => {
    expect(validateWalkthrough(steps(["Nd7"]), PV)).toBeUndefined();
  });

  it("is absent when the engine gave no line at all", () => {
    expect(validateWalkthrough(steps(["Nd7", "Qxd5"]), [])).toBeUndefined();
  });
});

describe("Claude system prompt — clarity rules", () => {
  it("requires the engine's line to be walked move by move", () => {
    expect(SYSTEM_PROMPT).toMatch(/WALK THE ENGINE'S LINE, MOVE BY MOVE/);
    expect(SYSTEM_PROMPT).toMatch(/lineWalkthrough/);
    expect(SYSTEM_PROMPT).toMatch(/VERBATIM/);
  });

  it("tells the model a trade is not a loss, with the pin case spelled out", () => {
    expect(SYSTEM_PROMPT).toMatch(/A TRADE IS NOT A LOSS/);
    expect(SYSTEM_PROMPT).toMatch(/queens coming off/i);
    expect(SYSTEM_PROMPT).toMatch(/pinned against the KING genuinely cannot move/);
  });
});
