import { appendFile, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readBoundedTextFile } from "../../src/core/bounded-text-file.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn<typeof actual.open>(actual.open) };
});

const tempDirs: string[] = [];

async function createFile(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-bounded-text-"));
  tempDirs.push(dir);
  const path = join(dir, "input.txt");
  await writeFile(path, text);
  return path;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("bounded text file reads", () => {
  it("accepts empty files and exact UTF-8 byte limits", async () => {
    expect(await readBoundedTextFile(await createFile(""), 0)).toBe("");
    const text = "a".repeat(65535) + "🦊\n";
    const path = await createFile(text);
    expect(await readBoundedTextFile(path, Buffer.byteLength(text))).toBe(text);
    expect(await readBoundedTextFile(path, Buffer.byteLength(text) - 1)).toBeNull();
  });

  it("bounds actual reads when the file grows after its size check", async () => {
    const path = await createFile("x");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const file = await actual.open(path, "r");
    const stat = file.stat.bind(file);
    vi.spyOn(file, "stat").mockImplementationOnce(async () => {
      const details = await stat();
      await appendFile(path, "y".repeat(1024 * 1024));
      return details;
    });
    const read = vi.spyOn(file, "read");
    const close = vi.spyOn(file, "close");
    vi.mocked(open).mockResolvedValueOnce(file);

    expect(await readBoundedTextFile(path, 4)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toHaveLength(5);
    expect(close).toHaveBeenCalledOnce();
  });

  it("continues across short reads before decoding UTF-8", async () => {
    const bytes = Buffer.from("🦊");
    let offset = 0;
    const file = {
      stat: async () => ({ size: 0, isFile: () => true }),
      read: async (buffer: Buffer) => {
        const bytesRead = offset < bytes.length ? 1 : 0;
        if (bytesRead) {
          buffer[0] = bytes[offset++]!;
        }
        return { bytesRead, buffer };
      },
      close: vi.fn<() => void>(),
    };
    vi.mocked(open).mockResolvedValueOnce(file as unknown as Awaited<ReturnType<typeof open>>);

    expect(await readBoundedTextFile("short-read.txt", bytes.length)).toBe("🦊");
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("closes the descriptor after a read error", async () => {
    const path = await createFile("x");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const file = await actual.open(path, "r");
    vi.spyOn(file, "read").mockRejectedValueOnce(new Error("read failed"));
    const close = vi.spyOn(file, "close");
    vi.mocked(open).mockResolvedValueOnce(file);

    await expect(readBoundedTextFile(path, 4)).rejects.toThrow("read failed");
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects directories when a regular file is required", async () => {
    const path = await createFile("x");
    expect(await readBoundedTextFile(join(path, ".."), 4, { regularFileOnly: true })).toBeNull();
  });

  it.skipIf(process.platform === "win32")("rejects a FIFO without waiting for a writer", async () => {
    const path = `${await createFile("")}.fifo`;
    execFileSync("mkfifo", [path]);
    const moduleUrl = pathToFileURL(resolve("src/core/bounded-text-file.ts")).href;
    const script = `import { readBoundedTextFile } from ${JSON.stringify(moduleUrl)};
      console.log(await readBoundedTextFile(${JSON.stringify(path)}, 4, { regularFileOnly: true }));`;
    expect(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 3000,
    }).trim()).toBe("null");
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid byte limits: %s", async (maxBytes) => {
    await expect(readBoundedTextFile("unused.txt", maxBytes)).rejects.toThrow(RangeError);
    expect(open).not.toHaveBeenCalled();
  });
});
import { execFileSync } from "node:child_process";
