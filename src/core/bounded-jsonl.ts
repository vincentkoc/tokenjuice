import { appendFile, lstat, mkdir, open, opendir, readFile, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1_000;
const LOCK_RETRIES = 8;
const LOCK_RETRY_MS = 10;
const MAX_RETENTION_DAYS = 365;
const MAX_SHARD_COUNT = 100;
const MAX_STORE_FILES = 10_000;
const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
const DIRECTORY_ENTRY_SLACK = 256;

export type BoundedJsonlOptions = {
  retentionDays?: number;
  shardCount?: number;
  maxSegmentBytes?: number;
  now?: Date;
};

export type BoundedJsonlPageOptions = {
  limit?: number;
  cursor?: string;
  maxFiles?: number;
  maxSegmentBytes?: number;
};

export type BoundedJsonlPage<T> = {
  records: Array<{ path: string; value: T }>;
  nextCursor?: string;
  partial: boolean;
};

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_SHARD_COUNT = 8;
const DEFAULT_MAX_SEGMENT_BYTES = 1024 * 1024;
const DEFAULT_PAGE_LIMIT = 1_000;
const MAX_PAGE_LIMIT = 10_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new RangeError(`${name} must be a positive integer no greater than ${maximum}`);
  }
  return resolved;
}

function resolveStoreOptions(options: BoundedJsonlOptions): {
  retentionDays: number;
  shardCount: number;
  maxSegmentBytes: number;
} {
  const retentionDays = positiveInteger(
    options.retentionDays,
    DEFAULT_RETENTION_DAYS,
    "retentionDays",
    MAX_RETENTION_DAYS,
  );
  const shardCount = positiveInteger(
    options.shardCount,
    DEFAULT_SHARD_COUNT,
    "shardCount",
    MAX_SHARD_COUNT,
  );
  if (retentionDays * shardCount > MAX_STORE_FILES) {
    throw new RangeError(`retentionDays * shardCount must not exceed ${MAX_STORE_FILES}`);
  }
  return {
    retentionDays,
    shardCount,
    maxSegmentBytes: positiveInteger(
      options.maxSegmentBytes,
      DEFAULT_MAX_SEGMENT_BYTES,
      "maxSegmentBytes",
      MAX_SEGMENT_BYTES,
    ),
  };
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shardFor(id: string, shardCount: number): number {
  const digest = createHash("sha256").update(id).digest();
  return digest[0]! % shardCount;
}

function segmentName(prefix: string, day: string, shard: number): string {
  return `${prefix}-${day}-${String(shard).padStart(2, "0")}.jsonl`;
}

function parseSegmentDay(name: string, prefix: string): string | undefined {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escapedPrefix}-(\\d{4}-\\d{2}-\\d{2})-\\d{2}\\.jsonl$`, "u")
    .exec(name)?.[1];
}

async function tryCreateLock(lockPath: string): Promise<string | undefined> {
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      // Age alone cannot prove ownership; reclaiming here can displace a live or replacement writer.
      return undefined;
    }
    throw error;
  }

  const owner = `${process.pid}:${randomUUID()}`;
  try {
    await writeFile(join(lockPath, "owner"), owner, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return owner;
  } catch {
    // Leave an unowned lock in place rather than risk deleting a replacement.
    return undefined;
  }
}

async function releaseLock(lockPath: string, owner: string): Promise<void> {
  try {
    const ownerPath = join(lockPath, "owner");
    if (await readFile(ownerPath, "utf8") === owner) {
      await unlink(ownerPath);
      await rmdir(lockPath);
    }
  } catch {
    // A missing or replaced lock no longer belongs to this writer.
  }
}

async function acquireLock(lockPath: string): Promise<string | undefined> {
  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt += 1) {
    const owner = await tryCreateLock(lockPath);
    if (owner) {
      return owner;
    }
    if (attempt < LOCK_RETRIES) {
      await wait(LOCK_RETRY_MS);
    }
  }

  return undefined;
}

async function pruneExpiredSegments(
  directory: string,
  prefix: string,
  retentionDays: number,
  maxFiles: number,
  now: Date,
): Promise<void> {
  const oldestDay = formatDay(new Date(now.getTime() - (retentionDays - 1) * DAY_MS));
  const directoryHandle = await opendir(directory);
  let inspected = 0;
  try {
    for await (const entry of directoryHandle) {
      inspected += 1;
      if (inspected > maxFiles * 2 + DIRECTORY_ENTRY_SLACK) {
        break;
      }
      if (!entry.isFile()) {
        continue;
      }
      const day = parseSegmentDay(entry.name, prefix);
      if (day && day < oldestDay) {
        const path = join(directory, entry.name);
        const lockPath = `${path}.lock`;
        const owner = await tryCreateLock(lockPath);
        if (!owner) {
          continue;
        }
        try {
          await rm(path, { force: true });
        } finally {
          await releaseLock(lockPath, owner);
        }
      }
    }
  } finally {
    await directoryHandle.close().catch(() => {});
  }
}

async function countOwnedSegments(
  directory: string,
  prefix: string,
  maxFiles: number,
): Promise<{ count: number; complete: boolean }> {
  const directoryHandle = await opendir(directory);
  let count = 0;
  let inspected = 0;
  try {
    for await (const entry of directoryHandle) {
      inspected += 1;
      if (inspected > maxFiles * 2 + DIRECTORY_ENTRY_SLACK) {
        return { count, complete: false };
      }
      if (entry.isFile() && parseSegmentDay(entry.name, prefix)) {
        count += 1;
        if (count >= maxFiles) {
          return { count, complete: true };
        }
      }
    }
  } finally {
    await directoryHandle.close().catch(() => {});
  }
  return { count, complete: true };
}

export async function appendBoundedJsonl(
  directory: string,
  prefix: string,
  id: string,
  value: unknown,
  options: BoundedJsonlOptions = {},
): Promise<string | undefined> {
  const { retentionDays, shardCount, maxSegmentBytes } = resolveStoreOptions(options);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("now must be a valid Date");
  }
  const line = `${JSON.stringify(value)}\n`;
  const lineBytes = Buffer.byteLength(line, "utf8");

  if (lineBytes > maxSegmentBytes) {
    return undefined;
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const maxFiles = retentionDays * shardCount;
  const path = join(directory, segmentName(prefix, formatDay(now), shardFor(id, shardCount)));
  const lockPath = `${path}.lock`;
  const admissionLockPath = join(directory, `.${prefix}.admission.lock`);
  const admissionOwner = await acquireLock(admissionLockPath);
  if (!admissionOwner) {
    return undefined;
  }

  let owner: string | undefined;
  try {
    await pruneExpiredSegments(directory, prefix, retentionDays, maxFiles, now);
    let targetExists = false;
    try {
      targetExists = (await lstat(path)).isFile();
      if (!targetExists) {
        return undefined;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (!targetExists) {
      const segmentCount = await countOwnedSegments(directory, prefix, maxFiles);
      if (!segmentCount.complete || segmentCount.count >= maxFiles) {
        return undefined;
      }
    }

    owner = await acquireLock(lockPath);
    if (!owner) {
      return undefined;
    }
    if (!targetExists) {
      try {
        const file = await open(path, "wx", 0o600);
        await file.close();
      } catch (error) {
        await releaseLock(lockPath, owner);
        owner = undefined;
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return undefined;
        }
        throw error;
      }
    }
  } catch (error) {
    if (owner) {
      await releaseLock(lockPath, owner);
      owner = undefined;
    }
    throw error;
  } finally {
    await releaseLock(admissionLockPath, admissionOwner);
  }

  if (!owner) {
    return undefined;
  }
  try {
    let currentBytes = 0;
    try {
      currentBytes = (await stat(path)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (currentBytes + lineBytes > maxSegmentBytes) {
      return undefined;
    }

    await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
    return path;
  } finally {
    await releaseLock(lockPath, owner);
  }
}

function encodeCursor(file: string, line: number): string {
  return Buffer.from(JSON.stringify({ file, line }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, prefix: string): { file: string; line: number } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object"
      && parsed !== null
      && !Array.isArray(parsed)
      && typeof (parsed as Record<string, unknown>).file === "string"
      && ((parsed as Record<string, unknown>).file as string).length <= 255
      && parseSegmentDay((parsed as Record<string, unknown>).file as string, prefix) !== undefined
      && Number.isSafeInteger((parsed as Record<string, unknown>).line)
      && Number((parsed as Record<string, unknown>).line) >= 0
    ) {
      return {
        file: (parsed as Record<string, unknown>).file as string,
        line: Number((parsed as Record<string, unknown>).line),
      };
    }
  } catch {
    // Fall through to the same public error for every malformed cursor.
  }
  throw new RangeError("cursor must identify a valid retained segment position");
}

export async function readBoundedJsonlPage<T>(
  directory: string,
  prefix: string,
  validate: (value: unknown) => value is T,
  options: BoundedJsonlPageOptions = {},
): Promise<BoundedJsonlPage<T>> {
  const limit = positiveInteger(options.limit, DEFAULT_PAGE_LIMIT, "limit", MAX_PAGE_LIMIT);
  const maxFiles = positiveInteger(options.maxFiles, DEFAULT_RETENTION_DAYS * DEFAULT_SHARD_COUNT, "maxFiles", MAX_STORE_FILES);
  const maxSegmentBytes = positiveInteger(
    options.maxSegmentBytes,
    DEFAULT_MAX_SEGMENT_BYTES,
    "maxSegmentBytes",
    MAX_SEGMENT_BYTES,
  );
  const names: string[] = [];
  let directoryTruncated = false;
  try {
    const directoryHandle = await opendir(directory);
    let inspected = 0;
    try {
      for await (const entry of directoryHandle) {
        inspected += 1;
        if (inspected > maxFiles * 2 + DIRECTORY_ENTRY_SLACK) {
          directoryTruncated = true;
          break;
        }
        if (entry.isFile() && parseSegmentDay(entry.name, prefix)) {
          if (names.length >= maxFiles) {
            directoryTruncated = true;
            break;
          }
          names.push(entry.name);
        }
      }
    } finally {
      await directoryHandle.close().catch(() => {});
    }
    names.sort().reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [], partial: false };
    }
    throw error;
  }

  const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor, prefix);
  let startFileIndex = 0;
  if (cursor) {
    const exactFileIndex = names.indexOf(cursor.file);
    if (exactFileIndex >= 0) {
      startFileIndex = exactFileIndex;
    } else {
      directoryTruncated = true;
      startFileIndex = names.findIndex((name) => name < cursor.file);
      if (startFileIndex < 0) {
        return { records: [], partial: true };
      }
    }
  }
  const records: Array<{ path: string; value: T }> = [];
  let rejectedRecords = false;

  for (let fileIndex = startFileIndex; fileIndex < names.length; fileIndex += 1) {
    const name = names[fileIndex]!;
    const path = join(directory, name);
    let details;
    try {
      details = await stat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (!details.isFile() || details.size > maxSegmentBytes) {
      directoryTruncated = true;
      continue;
    }
    let file;
    try {
      file = await open(path, "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        directoryTruncated = true;
        continue;
      }
      throw error;
    }
    let raw: string;
    try {
      const buffer = Buffer.allocUnsafe(maxSegmentBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maxSegmentBytes) {
        directoryTruncated = true;
        continue;
      }
      raw = buffer.toString("utf8", 0, bytesRead);
    } finally {
      await file.close();
    }
    const lines = raw.split("\n");
    const startLine = cursor && name === cursor.file ? cursor.line : 0;

    for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]!.trim();
      if (!line) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as unknown;
        if (validate(parsed)) {
          if (records.length >= limit) {
            return {
              records,
              nextCursor: encodeCursor(name, lineIndex),
              partial: true,
            };
          }
          records.push({ path, value: parsed });
        } else {
          rejectedRecords = true;
        }
      } catch {
        rejectedRecords = true;
        // One interrupted or malformed record must not hide the rest of the page.
      }
    }
  }

  return { records, partial: directoryTruncated || rejectedRecords };
}

export function boundedJsonlCapacity(options: BoundedJsonlOptions = {}): {
  maxFiles: number;
  maxBytes: number;
} {
  const { retentionDays, shardCount, maxSegmentBytes } = resolveStoreOptions(options);
  return {
    maxFiles: retentionDays * shardCount,
    maxBytes: retentionDays * shardCount * maxSegmentBytes,
  };
}
