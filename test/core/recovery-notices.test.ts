import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveArtifactBaseDir } from "../../src/core/artifacts.js";
import { decorateWrapInlineText, quoteRecoveryDirectory } from "../../src/core/wrap-format.js";
import type { CompactResult } from "../../src/types.js";

function storedResult(directory: string): CompactResult {
  return {
    inlineText: "summary",
    compaction: { authoritative: true, kinds: ["head-tail-omission"] },
    rawRef: { id: "tj_0123456789ab", storage: "file", path: join(directory, "tj_0123456789ab.txt"), metadataPath: join(directory, "tj_0123456789ab.json") },
    stats: { rawChars: 4000, reducedChars: 7, ratio: 7 / 4000 },
    classification: { family: "generic", confidence: 1 },
  };
}

describe("stored-output recovery notices", () => {
  it("uses PowerShell literal quoting on Windows", () => {
    expect(quoteRecoveryDirectory("C:/owner's $cache/$(whoami)", "win32"))
      .toBe("'C:/owner''s $cache/$(whoami)'");
  });

  it("keeps the default-directory command short", () => {
    const text = decorateWrapInlineText(storedResult(resolveArtifactBaseDir()), false);
    expect(text).toContain("tokenjuice cat tj_0123456789ab");
    expect(text).not.toContain("--store-dir");
  });

  it.skipIf(process.platform === "win32")("quotes custom relative directories for a POSIX shell", () => {
    const directory = "artifacts with spaces/owner's $cache";
    const text = decorateWrapInlineText(storedResult(directory), false);
    const argument = text.split("--store-dir ")[1]!;
    const parsed = spawnSync("/bin/sh", ["-c", `printf '%s' ${argument}`], { encoding: "utf8" });
    expect(parsed.status).toBe(0);
    expect(parsed.stdout).toBe(resolve(directory));
  });

  it("identifies an incomplete captured original", () => {
    const result = { ...storedResult(resolveArtifactBaseDir()), captureTruncated: true };
    const text = decorateWrapInlineText(result, false);
    expect(text).toContain("Capture limit reached");
    expect(text).toContain("stored output are incomplete");
    expect(text).not.toContain("complete, authoritative");
    expect(text).toContain("Captured output is available locally");
  });

  it("does not claim a lossy summary is the complete command output", () => {
    const text = decorateWrapInlineText(storedResult(resolveArtifactBaseDir()), false);
    expect(text).toContain("some content was omitted");
    expect(text).not.toContain("Do not re-run");
  });
});
