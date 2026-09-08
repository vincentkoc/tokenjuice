import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendBoundedJsonl, boundedJsonlCapacity, readBoundedJsonlPage } from "../../src/core/bounded-jsonl.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-bounded-jsonl-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function isEvent(value: unknown): value is { id: string } {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === "string";
}

describe("bounded JSONL segments", () => {
  it("has a fixed file and byte ceiling independent of event count", () => {
    expect(boundedJsonlCapacity({
      retentionDays: 14,
      shardCount: 8,
      maxSegmentBytes: 1024,
    })).toEqual({
      maxFiles: 112,
      maxBytes: 114_688,
    });
  });

  it.each([
    { retentionDays: Number.NaN },
    { shardCount: 1.5 },
    { maxSegmentBytes: 0 },
  ])("rejects invalid store bounds: %j", async (options) => {
    const dir = await createTempDir();
    await expect(appendBoundedJsonl(dir, "events", "event-1", { id: "event-1" }, options))
      .rejects.toThrow("must be a positive integer");
  });

  it("does not steal or delete an existing writer lock", async () => {
    const dir = await createTempDir();
    const path = await appendBoundedJsonl(dir, "events", "event-1", { id: "event-1" }, {
      shardCount: 1,
    });
    const lockPath = `${path}.lock`;
    await mkdir(lockPath);
    await utimes(lockPath, new Date(0), new Date(0));

    await expect(appendBoundedJsonl(dir, "events", "event-1", { id: "event-2" }, {
      shardCount: 1,
    })).resolves.toBeUndefined();
    expect((await stat(lockPath)).isDirectory()).toBe(true);
  });

  it("keeps every event whose concurrent append was accepted", async () => {
    const dir = await createTempDir();
    const accepted = await Promise.all(
      Array.from({ length: 64 }, async (_, index) => {
        const id = `event-${index}`;
        const path = await appendBoundedJsonl(dir, "events", id, { id }, {
          shardCount: 4,
          maxSegmentBytes: 64 * 1024,
        });
        return path ? id : undefined;
      }),
    );
    const acceptedIds = accepted.filter((id): id is string => typeof id === "string");
    const files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
    const storedIds = (
      await Promise.all(files.map(async (name) =>
        (await readFile(join(dir, name), "utf8"))
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => (JSON.parse(line) as { id: string }).id)
      ))
    ).flat();

    expect(acceptedIds.length).toBeGreaterThan(0);
    expect(storedIds.sort()).toEqual(acceptedIds.sort());
  });

  it("pages records and skips malformed lines without hiding later records", async () => {
    const dir = await createTempDir();
    const path = await appendBoundedJsonl(dir, "events", "event-1", { id: "event-1" }, {
      shardCount: 1,
    });
    await appendFile(path!, "not-json\n", "utf8");
    await appendBoundedJsonl(dir, "events", "event-2", { id: "event-2" }, {
      shardCount: 1,
    });

    const first = await readBoundedJsonlPage(dir, "events", isEvent, { limit: 1 });
    const second = await readBoundedJsonlPage(dir, "events", isEvent, {
      limit: 1,
      cursor: first.nextCursor,
    });

    expect(first.records.map((record) => record.value.id)).toEqual(["event-1"]);
    expect(second.records.map((record) => record.value.id)).toEqual(["event-2"]);
  });

  it("skips oversized segments and reports partial coverage", async () => {
    const dir = await createTempDir();
    await writeFile(
      join(dir, "events-2026-09-08-00.jsonl"),
      `${JSON.stringify({ id: "event-1", payload: "x".repeat(128) })}\n`,
      "utf8",
    );

    const page = await readBoundedJsonlPage(dir, "events", isEvent, {
      maxSegmentBytes: 64,
    });

    expect(page.records).toEqual([]);
    expect(page.partial).toBe(true);
  });

  it("prunes only expired files owned by its prefix", async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, "events-2026-08-01-00.jsonl"), "{}\n", "utf8");
    await writeFile(join(dir, "events-2026-08-01-01.jsonl"), "{}\n", "utf8");
    await mkdir(join(dir, "events-2026-08-01-01.jsonl.lock"));
    await writeFile(join(dir, "other-2026-08-01-00.jsonl"), "{}\n", "utf8");

    await appendBoundedJsonl(dir, "events", "current", { id: "current" }, {
      now: new Date("2026-09-08T12:00:00.000Z"),
      retentionDays: 14,
      shardCount: 1,
    });

    const files = await readdir(dir);
    expect(files).not.toContain("events-2026-08-01-00.jsonl");
    expect(files).toContain("events-2026-08-01-01.jsonl");
    expect(files).toContain("other-2026-08-01-00.jsonl");
  });
});
