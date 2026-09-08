import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { appendBoundedJsonl, boundedJsonlCapacity, readBoundedJsonlPage } from "../../src/core/bounded-jsonl.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      if (String(args[0]).endsWith("raced-events-2026-09-08-00.jsonl") && args[1] === "r") {
        throw Object.assign(new Error("raced segment was pruned"), { code: "ENOENT" });
      }
      return await actual.open(...args);
    },
  };
});

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

function idForShard(targetShard: number, shardCount: number): string {
  for (let index = 0; index < 10_000; index += 1) {
    const id = `event-shard-${index}`;
    if (createHash("sha256").update(id).digest()[0]! % shardCount === targetShard) {
      return id;
    }
  }
  throw new Error(`unable to find id for shard ${targetShard}`);
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

    const complete = await readBoundedJsonlPage(dir, "events", isEvent, { limit: 10 });
    expect(complete.records.map((record) => record.value.id)).toEqual(["event-1", "event-2"]);
    expect(complete.partial).toBe(true);
  });

  it("reports partial coverage when a parsed record fails validation", async () => {
    const dir = await createTempDir();
    const path = await appendBoundedJsonl(dir, "events", "event-1", { id: "event-1" }, {
      shardCount: 1,
    });
    await appendFile(path!, "{}\n", "utf8");

    const page = await readBoundedJsonlPage(dir, "events", isEvent);

    expect(page.records.map((record) => record.value.id)).toEqual(["event-1"]);
    expect(page.partial).toBe(true);
  });

  it("resumes from an older segment when the cursor segment was removed", async () => {
    const dir = await createTempDir();
    const newestPath = join(dir, "events-2026-09-08-00.jsonl");
    const cursorPath = join(dir, "events-2026-09-07-00.jsonl");
    const olderPath = join(dir, "events-2026-09-06-00.jsonl");
    await writeFile(newestPath, `${JSON.stringify({ id: "newest" })}\n`, "utf8");
    await writeFile(cursorPath, `${JSON.stringify({ id: "removed" })}\n`, "utf8");
    await writeFile(olderPath, `${JSON.stringify({ id: "older" })}\n`, "utf8");

    const first = await readBoundedJsonlPage(dir, "events", isEvent, { limit: 1 });
    await rm(cursorPath);
    const second = await readBoundedJsonlPage(dir, "events", isEvent, {
      limit: 10,
      cursor: first.nextCursor,
    });

    expect(first.records.map((record) => record.value.id)).toEqual(["newest"]);
    expect(second.records.map((record) => record.value.id)).toEqual(["older"]);
    expect(second.partial).toBe(true);
  });

  it.each([
    ["malformed encoding", "not-a-cursor"],
    [
      "foreign segment prefix",
      Buffer.from(JSON.stringify({ file: "other-2026-09-08-00.jsonl", line: 0 }), "utf8").toString("base64url"),
    ],
    [
      "unsafe line offset",
      Buffer.from(JSON.stringify({
        file: "events-2026-09-08-00.jsonl",
        line: Number.MAX_SAFE_INTEGER + 1,
      }), "utf8").toString("base64url"),
    ],
  ])("rejects a cursor with %s", async (_, cursor) => {
    const dir = await createTempDir();
    await writeFile(join(dir, "events-2026-09-08-00.jsonl"), `${JSON.stringify({ id: "event-1" })}\n`, "utf8");

    await expect(readBoundedJsonlPage(dir, "events", isEvent, { cursor }))
      .rejects.toThrow(RangeError);
  });

  it("reports partial coverage when a segment disappears before open", async () => {
    const dir = await createTempDir();
    await writeFile(
      join(dir, "raced-events-2026-09-08-00.jsonl"),
      `${JSON.stringify({ id: "event-1" })}\n`,
      "utf8",
    );

    const page = await readBoundedJsonlPage(dir, "raced-events", isEvent);

    expect(page.records).toEqual([]);
    expect(page.partial).toBe(true);
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

  it("does not create a segment when a locked expired segment exhausts the cap", async () => {
    const dir = await createTempDir();
    const expiredPath = join(dir, "events-2026-08-01-00.jsonl");
    await writeFile(expiredPath, "{}\n", "utf8");
    await mkdir(`${expiredPath}.lock`);

    const result = await appendBoundedJsonl(dir, "events", "current", { id: "current" }, {
      now: new Date("2026-09-08T12:00:00.000Z"),
      retentionDays: 1,
      shardCount: 1,
    });

    expect(result).toBeUndefined();
    expect((await readdir(dir)).filter((name) => name.endsWith(".jsonl"))).toEqual([
      "events-2026-08-01-00.jsonl",
    ]);
  });

  it("serializes cross-shard admission when protected segments leave one slot", async () => {
    const dir = await createTempDir();
    const expiredPath = join(dir, "events-2026-08-01-00.jsonl");
    await writeFile(expiredPath, "{}\n", "utf8");
    await mkdir(`${expiredPath}.lock`);
    const options = {
      now: new Date("2026-09-08T12:00:00.000Z"),
      retentionDays: 1,
      shardCount: 2,
    };

    const results = await Promise.all([
      appendBoundedJsonl(dir, "events", idForShard(0, 2), { id: "shard-0" }, options),
      appendBoundedJsonl(dir, "events", idForShard(1, 2), { id: "shard-1" }, options),
    ]);

    expect(results.filter((path): path is string => typeof path === "string")).toHaveLength(1);
    expect((await readdir(dir)).filter((name) => name.endsWith(".jsonl"))).toHaveLength(2);
    expect((await stat(`${expiredPath}.lock`)).isDirectory()).toBe(true);
  });
});
