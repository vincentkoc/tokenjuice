import { mkdir } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn<typeof actual.mkdir>(actual.mkdir),
  };
});

import { tryStoreArtifactMetadata } from "../../src/core/artifacts.js";

const input = {
  input: { toolName: "exec", command: "tokenjuice wrap --raw -- cat AGENTS.md", exitCode: 0 },
  rawText: "raw output\n",
  classification: { family: "generic", confidence: 1, matchedReducer: "generic/fallback" },
  stats: { rawChars: 11, reducedChars: 11, ratio: 1 },
};

function storageError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`storage failed: ${code}`), { code });
}

beforeEach(() => {
  vi.mocked(mkdir).mockReset();
});

describe("tryStoreArtifactMetadata", () => {
  it.each(["EPERM", "EROFS", "ENOTDIR", "ENAMETOOLONG", "ELOOP"])(
    "fails open for %s metadata storage errors",
    async (code) => {
      vi.mocked(mkdir).mockRejectedValueOnce(storageError(code));

      await expect(tryStoreArtifactMetadata(input)).resolves.toBeUndefined();
    },
  );

  it("does not hide programmer exceptions", async () => {
    const error = new TypeError("metadata construction failed");
    vi.mocked(mkdir).mockRejectedValueOnce(error);

    await expect(tryStoreArtifactMetadata(input)).rejects.toBe(error);
  });
});
