import { describe, it, expect } from "vitest";
import { isThinReflection, generateFollowUpQuestion } from "./followup";
import type { ConceptHighlight } from "@/lib/types";

describe("isThinReflection", () => {
  it("flags an empty answer as thin", () => {
    expect(isThinReflection("")).toBe(true);
    expect(isThinReflection("   ")).toBe(true);
  });

  it("flags a short answer (fewer than 8 words) as thin", () => {
    expect(isThinReflection("Looked good to me.")).toBe(true);
  });

  it("flags common filler-only answers as thin even if borderline length", () => {
    expect(isThinReflection("Not sure.")).toBe(true);
    expect(isThinReflection("I don't know.")).toBe(true);
    expect(isThinReflection("Just felt right.")).toBe(true);
  });

  it("does not flag a substantive answer", () => {
    expect(
      isThinReflection(
        "I thought this developed my rook to an open file and put pressure on the backward pawn."
      )
    ).toBe(false);
  });
});

describe("generateFollowUpQuestion", () => {
  it("prefers a concept-specific question when a known concept is present", () => {
    const concepts: ConceptHighlight[] = [
      { concept: "hanging piece", note: "White queen on d1 is undefended", squares: ["d1"] },
    ];
    const question = generateFollowUpQuestion(concepts, "seed-1");
    expect(question).toMatch(/defended/i);
  });

  it("never reveals a move, evaluation, or classification", () => {
    const question = generateFollowUpQuestion([], "seed-2");
    expect(question).not.toMatch(/\d+\.\d/); // no eval-looking numbers
    expect(question).not.toMatch(/blunder|mistake|inaccuracy|best move/i);
  });

  it("falls back to a deterministic generic question when no concept matches", () => {
    const q1 = generateFollowUpQuestion([], "same-seed");
    const q2 = generateFollowUpQuestion([], "same-seed");
    expect(q1).toBe(q2);
  });

  it("never asks 'what made you settle on this move over other options' when the replay is the same move", () => {
    // There's nothing to explain about "settling on" a different option if
    // the player replayed their original move — check every seed so the
    // hash-based selection can't land on it by chance.
    for (let i = 0; i < 50; i++) {
      const question = generateFollowUpQuestion([], `seed-${i}`, true);
      expect(question).not.toMatch(/settle on this move/i);
    }
  });

  it("can still ask 'what made you settle on this move' when the replay differs from the original", () => {
    let sawSettleQuestion = false;
    for (let i = 0; i < 50; i++) {
      const question = generateFollowUpQuestion([], `seed-${i}`, false);
      if (/settle on this move/i.test(question)) sawSettleQuestion = true;
    }
    expect(sawSettleQuestion).toBe(true);
  });

  it("concept-specific questions are unaffected by replaySame — they're about the original move's thinking, not the replay choice", () => {
    const concepts: ConceptHighlight[] = [
      { concept: "hanging piece", note: "White queen on d1 is undefended", squares: ["d1"] },
    ];
    const withReplaySame = generateFollowUpQuestion(concepts, "seed-3", true);
    const withoutReplaySame = generateFollowUpQuestion(concepts, "seed-3", false);
    expect(withReplaySame).toBe(withoutReplaySame);
    expect(withReplaySame).toMatch(/defended/i);
  });
});
