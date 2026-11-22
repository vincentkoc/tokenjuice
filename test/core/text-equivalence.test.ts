import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const samples = ["", "plain ASCII", "e\u0301a\u0308", "👨‍👩‍👧‍👦👩🏽‍💻", "🇦🇹🇺🇸🇦", "👍🏽👍🏻", "a\r\nb\r\n", "\ud800x\udc00", "é\r\n👩🏽‍💻🇦🇹\ud800".repeat(30)];
const bounds = [-Infinity, -100, -2.5, -1, -0, 0, 1, 2.5, 17, 30, 1000, Infinity, NaN];

// The pre-optimization implementation materialized all segments for each count
// and slice. Keep that independent oracle, including Array.slice coercions.
describe.each([true, false])("text equivalence (Segmenter=%s)", (useSegmenter) => {
  it("matches the previous count, slice, and clipping behavior", async () => {
    vi.resetModules();
    if (!useSegmenter) vi.stubGlobal("Intl", {});
    try {
      const { countTextChars, sliceTextChars, segmentTextChars, clampText, clampTextWithMetadata, clampTextMiddleWithMetadata } = await import("../../src/core/text.js");
      const { clipMiddleWithHash, compactWholeJsonText } = await import("../../src/core/reduce-utils.js");
      const segments = (text: string) => useSegmenter
        ? Array.from(segmenter.segment(text), (part) => part.segment)
        : Array.from(text);
      const count = (text: string) => segments(text).length;
      const slice = (text: string, start: number, end?: number) => segments(text).slice(start, end).join("");
      const trimHead = (text: string) => {
        const index = text.lastIndexOf("\n");
        return index === -1 || index < Math.floor(text.length * 0.5) ? text : text.slice(0, index);
      };
      const trimTail = (text: string) => {
        const index = text.indexOf("\n");
        return index === -1 || index > Math.ceil(text.length * 0.5) ? text : text.slice(index + 1);
      };
      for (const text of samples) {
        expect(countTextChars(text)).toBe(count(text));
        expect(segmentTextChars(text)).toEqual(segments(text));
        for (const start of bounds) {
          for (const end of [...bounds, undefined]) {
            expect(sliceTextChars(text, start, end)).toBe(slice(text, start, end));
          }
        }
        for (const budget of bounds) {
          for (const noOmit of [false, true]) {
            const suffix = "\n... truncated ...";
            const tail = count(text) <= budget ? text : `${trimHead(slice(text, 0, Math.max(0, budget - count(suffix))))}${suffix}`;
            expect(clampText(text, budget)).toBe(tail);
            expect(clampTextWithMetadata(text, budget, noOmit).text).toBe(noOmit ? text : tail);
            const marker = "\n... omitted ...\n";
            const body = Math.max(0, budget - count(marker));
            const head = Math.ceil(body * 0.7);
            const middle = count(text) <= budget || noOmit ? text : `${trimHead(slice(text, 0, head))}${marker}${trimTail(slice(text, -Math.max(0, body - head)))}`;
            expect(clampTextMiddleWithMetadata(text, budget, noOmit).text).toBe(middle);
            const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
            const hashHead = Math.max(20, Math.floor(budget * 0.55));
            const hashed = count(text) <= budget || noOmit ? text : `${slice(text, 0, hashHead)} ...[${count(text) - budget} chars omitted, sha256:${hash}]... ${slice(text, -Math.max(20, budget - hashHead))}`;
            expect(clipMiddleWithHash(text, budget, noOmit).text).toBe(hashed);
            const json = JSON.stringify({ text });
            const jsonHash = createHash("sha256").update(json).digest("hex").slice(0, 12);
            const jsonMarker = `...[${count(json) - budget} chars omitted, sha256:${jsonHash}]...`;
            const jsonBody = budget - count(jsonMarker);
            const jsonHead = Math.ceil(jsonBody * 0.7);
            const jsonTail = Math.max(0, jsonBody - jsonHead);
            const strict = count(json) <= budget || noOmit ? json
              : budget <= count(jsonMarker) ? slice(jsonMarker, 0, budget)
              : `${slice(json, 0, jsonHead)}${jsonMarker}${jsonTail > 0 ? slice(json, -jsonTail) : ""}`;
            expect(compactWholeJsonText(json, budget, noOmit)?.text).toBe(strict);
          }
        }
      }
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
