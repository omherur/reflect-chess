import { describe, it, expect, vi } from "vitest";
import { readRevealStream } from "./reveal-stream";
import type { KeyMomentVerdict } from "@/lib/types";

const VERDICT = { id: "km_1", originalSan: "Nd4" } as unknown as KeyMomentVerdict;

/** A Response whose body yields exactly the given chunks, in order. */
function streamed(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body);
}

function line(event: unknown): string {
  return `${JSON.stringify(event)}\n`;
}

describe("readRevealStream", () => {
  it("reports each stage in order and returns the final verdict", async () => {
    const res = streamed([
      line({ type: "stage", stage: "checking" }),
      line({ type: "stage", stage: "explaining" }),
      line({ type: "stage", stage: "saving" }),
      line({ type: "done", keyMoment: VERDICT }),
    ]);
    const onStage = vi.fn();

    await expect(readRevealStream(res, onStage)).resolves.toEqual(VERDICT);
    expect(onStage.mock.calls.map((c) => c[0])).toEqual(["checking", "explaining", "saving"]);
  });

  it("handles a chunk boundary landing in the middle of a line", async () => {
    // Nothing guarantees a network chunk ends on a newline. Parsing what has
    // arrived so far instead of waiting for the newline would throw on
    // half a JSON object.
    const whole = line({ type: "stage", stage: "explaining" }) + line({ type: "done", keyMoment: VERDICT });
    const split = Math.floor(whole.length / 3);
    const res = streamed([whole.slice(0, split), whole.slice(split, split * 2), whole.slice(split * 2)]);
    const onStage = vi.fn();

    await expect(readRevealStream(res, onStage)).resolves.toEqual(VERDICT);
    expect(onStage).toHaveBeenCalledWith("explaining");
  });

  it("accepts a final line with no trailing newline", async () => {
    const res = streamed([JSON.stringify({ type: "done", keyMoment: VERDICT })]);
    await expect(readRevealStream(res, vi.fn())).resolves.toEqual(VERDICT);
  });

  it("throws the server's message when the stream carries an error event", async () => {
    // The response is already 200 by the time this arrives, so the failure
    // has nowhere to live except the stream itself.
    const res = streamed([
      line({ type: "stage", stage: "explaining" }),
      line({ type: "error", error: "Something went wrong generating your verdict." }),
    ]);
    await expect(readRevealStream(res, vi.fn())).rejects.toThrow(
      "Something went wrong generating your verdict."
    );
  });

  it("throws rather than resolving empty when the stream ends with no verdict", async () => {
    const res = streamed([line({ type: "stage", stage: "checking" })]);
    await expect(readRevealStream(res, vi.fn())).rejects.toThrow(/connection dropped/i);
  });

  it("falls back to reading the whole body when it isn't streamable", async () => {
    // A buffering proxy, or a client with no ReadableStream support: the
    // verdict still has to come through, only the live stages are lost.
    const text = line({ type: "stage", stage: "saving" }) + line({ type: "done", keyMoment: VERDICT });
    const res = { body: null, text: async () => text } as unknown as Response;
    const onStage = vi.fn();

    await expect(readRevealStream(res, onStage)).resolves.toEqual(VERDICT);
    expect(onStage).toHaveBeenCalledWith("saving");
  });
});
