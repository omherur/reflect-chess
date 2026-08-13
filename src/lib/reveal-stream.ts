import type { KeyMomentVerdict } from "@/lib/types";
import type { RevealStage } from "@/lib/reveal-progress";

/** One line of the reflect endpoint's newline-delimited event stream. */
export type RevealEvent =
  | { type: "stage"; stage: RevealStage }
  | { type: "done"; keyMoment: KeyMomentVerdict }
  | { type: "error"; error: string };

/**
 * Reads the reflect endpoint's event stream, reporting each stage the
 * server announces and returning the verdict carried by the final event.
 *
 * Two things here are easy to get wrong and are what the tests pin down.
 * First, a chunk boundary can fall anywhere — including the middle of a
 * JSON line — so lines are only parsed once a newline has actually
 * arrived. Second, once the response has begun streaming its status is
 * already 200, so a failure part-way through arrives as an error EVENT,
 * not an error code; without handling that, a failed reveal would look
 * like a success with a missing verdict.
 *
 * A response with no readable body (an old browser, or a proxy that
 * buffered the whole thing) still works — it's read as text and split the
 * same way, just without live stage updates.
 */
export async function readRevealStream(
  res: Response,
  onStage: (stage: RevealStage) => void
): Promise<KeyMomentVerdict> {
  let verdict: KeyMomentVerdict | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as RevealEvent;
    if (event.type === "stage") onStage(event.stage);
    else if (event.type === "error") throw new Error(event.error);
    else verdict = event.keyMoment;
  };

  if (!res.body) {
    for (const line of (await res.text()).split("\n")) handleLine(line);
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    handleLine(buffer); // a final line with no trailing newline
  }

  if (!verdict) {
    // The stream closed with neither a verdict nor an error — a dropped
    // connection rather than a rejected reflection. Whether it saved is
    // genuinely unknown from here, so say that instead of guessing.
    throw new Error(
      "The connection dropped before your verdict arrived. Reload to see if it saved."
    );
  }
  return verdict;
}
