import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import { appendBoundedJsonl, readBoundedJsonlPage } from "./bounded-jsonl.js";
import { getCommandName, getEffectiveCommandArgv } from "./command.js";
import { countTextChars, stripAnsi } from "./text.js";
import { resolveArtifactSource } from "./source.js";

import type { ArtifactMetadataPage, ArtifactMetadataPageOptions, ArtifactMetadataRef, StoredArtifact, StoredArtifactInput, StoredArtifactMetadata, StoredArtifactRef, ToolExecutionInput } from "../types.js";

const ARTIFACT_ID_PATTERN = /^tj_[0-9a-f-]{12}$/iu;
export const ARTIFACT_DIR_ENV = "TOKENJUICE_ARTIFACT_DIR";
export const STATS_ENABLED_ENV = "TOKENJUICE_STATS";
const METADATA_SEGMENT_DIRECTORY = "metadata-v1";
const METADATA_SEGMENT_PREFIX = "events";
const DEFAULT_METADATA_LIST_LIMIT = 10_000;
const OPTIONAL_METADATA_STORAGE_ERROR_CODES = new Set([
  "EACCES",
  "EDQUOT",
  "EEXIST",
  "EFBIG",
  "EIO",
  "EISDIR",
  "ELOOP",
  "EMFILE",
  "ENAMETOOLONG",
  "ENFILE",
  "ENOENT",
  "ENOSPC",
  "ENOTDIR",
  "EPERM",
  "EROFS",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredArtifactMetadata(value: unknown): value is StoredArtifactMetadata {
  if (!isRecord(value) || typeof value.createdAt !== "string" || typeof value.rawChars !== "number") {
    return false;
  }

  if (!isRecord(value.classification) || typeof value.classification.family !== "string" || typeof value.classification.confidence !== "number") {
    return false;
  }

  if ("matchedReducer" in value.classification && value.classification.matchedReducer !== undefined && typeof value.classification.matchedReducer !== "string") {
    return false;
  }

  if ("toolName" in value && value.toolName !== undefined && typeof value.toolName !== "string") {
    return false;
  }
  if ("source" in value && value.source !== undefined && typeof value.source !== "string") {
    return false;
  }
  if ("command" in value && value.command !== undefined && typeof value.command !== "string") {
    return false;
  }
  if ("commandFamily" in value && value.commandFamily !== undefined && typeof value.commandFamily !== "string") {
    return false;
  }
  if ("commandDigest" in value && value.commandDigest !== undefined && typeof value.commandDigest !== "string") {
    return false;
  }
  if ("exitCode" in value && value.exitCode !== undefined && typeof value.exitCode !== "number") {
    return false;
  }
  if ("captureTruncated" in value && value.captureTruncated !== undefined && typeof value.captureTruncated !== "boolean") {
    return false;
  }
  if ("reducedChars" in value && value.reducedChars !== undefined && typeof value.reducedChars !== "number") {
    return false;
  }
  if ("ratio" in value && value.ratio !== undefined && typeof value.ratio !== "number") {
    return false;
  }

  return true;
}

function extractCaptureTruncatedFlag(input: ToolExecutionInput): boolean | undefined {
  const value = input.metadata?.tokenjuiceCaptureTruncated;
  return typeof value === "boolean" ? value : undefined;
}

function getDefaultArtifactDir(): string {
  const artifactDir = process.env[ARTIFACT_DIR_ENV];
  if (typeof artifactDir === "string" && artifactDir.trim()) {
    return artifactDir.trim();
  }

  return join(homedir(), ".tokenjuice", "artifacts");
}

export function resolveArtifactBaseDir(storeDir?: string): string {
  return storeDir ?? getDefaultArtifactDir();
}

export function isValidArtifactId(id: string): boolean {
  return ARTIFACT_ID_PATTERN.test(id);
}

function buildArtifactPaths(id: string, storeDir?: string): StoredArtifactRef {
  if (!isValidArtifactId(id)) {
    throw new Error(`invalid artifact id: ${id}`);
  }

  const base = resolveArtifactBaseDir(storeDir);
  return {
    id,
    storage: "file",
    path: join(base, `${id}.txt`),
    metadataPath: join(base, `${id}.json`),
  };
}

type StoredMetadataEvent = {
  id: string;
  hasRaw: boolean;
  metadata: StoredArtifactMetadata;
};

function isStoredMetadataEvent(value: unknown): value is StoredMetadataEvent {
  return isRecord(value)
    && typeof value.id === "string"
    && isValidArtifactId(value.id)
    && typeof value.hasRaw === "boolean"
    && isStoredArtifactMetadata(value.metadata);
}

function metadataSegmentDir(storeDir?: string): string {
  return join(resolveArtifactBaseDir(storeDir), METADATA_SEGMENT_DIRECTORY);
}

const SAFE_COMMAND_FAMILY = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;

export function getTelemetryCommandFamily(
  input: Pick<ToolExecutionInput, "argv" | "command">,
): string | undefined {
  try {
    const family = getCommandName(getEffectiveCommandArgv(input));
    return family && SAFE_COMMAND_FAMILY.test(family) ? family : undefined;
  } catch {
    return undefined;
  }
}

function buildTelemetryMetadata(metadata: StoredArtifactMetadata, input: ToolExecutionInput): StoredArtifactMetadata {
  const retainedMetadata = { ...metadata };
  delete retainedMetadata.command;
  const family = getTelemetryCommandFamily(input);
  return {
    ...retainedMetadata,
    ...(family ? { commandFamily: family } : {}),
  };
}

async function appendMetadataEvent(
  id: string,
  metadata: StoredArtifactMetadata,
  input: ToolExecutionInput,
  hasRaw: boolean,
  storeDir?: string,
): Promise<string | undefined> {
  return await appendBoundedJsonl(
    metadataSegmentDir(storeDir),
    METADATA_SEGMENT_PREFIX,
    id,
    {
      id,
      hasRaw,
      metadata: buildTelemetryMetadata(metadata, input),
    } satisfies StoredMetadataEvent,
  );
}

export function shouldRecordStats(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[STATS_ENABLED_ENV]?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "no" && value !== "off";
}

export async function storeArtifact(input: StoredArtifactInput, storeDir?: string): Promise<StoredArtifactRef> {
  const id = `tj_${randomUUID().slice(0, 12)}`;
  const ref = buildArtifactPaths(id, storeDir);
  await mkdir(resolveArtifactBaseDir(storeDir), { recursive: true, mode: 0o700 });
  const captureTruncated = extractCaptureTruncatedFlag(input.input);

  const artifact: StoredArtifact = {
    id,
    rawText: input.rawText,
    metadata: {
      createdAt: new Date().toISOString(),
      source: resolveArtifactSource(input.input),
      classification: input.classification,
      rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
      ...(input.input.toolName ? { toolName: input.input.toolName } : {}),
      ...(input.input.command ? { command: input.input.command } : {}),
      ...(typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {}),
      ...(captureTruncated !== undefined ? { captureTruncated } : {}),
      ...(input.stats ? { reducedChars: input.stats.reducedChars, ratio: input.stats.ratio } : {}),
    },
  };

  await Promise.all([
    writeFile(ref.path, input.rawText, { encoding: "utf8", mode: 0o600 }),
    writeFile(ref.metadataPath, JSON.stringify(artifact.metadata, null, 2), { encoding: "utf8", mode: 0o600 }),
  ]);
  if (input.recordStats ?? shouldRecordStats()) {
    await appendMetadataEvent(id, artifact.metadata, input.input, true, storeDir).catch(() => undefined);
  }

  return ref;
}

export async function storeArtifactMetadata(input: StoredArtifactInput, storeDir?: string): Promise<ArtifactMetadataRef> {
  const id = `tj_${randomUUID().slice(0, 12)}`;
  const captureTruncated = extractCaptureTruncatedFlag(input.input);
  const metadata: StoredArtifactMetadata = {
    createdAt: new Date().toISOString(),
    source: resolveArtifactSource(input.input),
    classification: input.classification,
    rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
    ...(input.input.toolName ? { toolName: input.input.toolName } : {}),
    ...(input.input.command ? { command: input.input.command } : {}),
    ...(typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {}),
    ...(captureTruncated !== undefined ? { captureTruncated } : {}),
    ...(input.stats ? { reducedChars: input.stats.reducedChars, ratio: input.stats.ratio } : {}),
  };

  const telemetryMetadata = buildTelemetryMetadata(metadata, input.input);
  const metadataPath = await appendMetadataEvent(id, telemetryMetadata, input.input, false, storeDir);
  if (!metadataPath) {
    throw Object.assign(new Error("metadata segment is full or busy"), { code: "EFBIG" });
  }

  return {
    id,
    storage: "file",
    metadataPath,
    metadataFormat: "jsonl-segment",
    metadataRecordId: id,
    metadata: telemetryMetadata,
  };
}

export async function tryStoreArtifactMetadata(
  input: StoredArtifactInput,
  storeDir?: string,
): Promise<ArtifactMetadataRef | undefined> {
  try {
    return await storeArtifactMetadata(input, storeDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code !== "string" || !OPTIONAL_METADATA_STORAGE_ERROR_CODES.has(code)) {
      throw error;
    }

    return undefined;
  }
}

export async function getArtifact(id: string, storeDir?: string): Promise<StoredArtifact | null> {
  if (!isValidArtifactId(id)) {
    return null;
  }

  const ref = buildArtifactPaths(id, storeDir);
  try {
    const [rawText, metadataRaw] = await Promise.all([
      readFile(ref.path, "utf8"),
      readFile(ref.metadataPath, "utf8"),
    ]);
    return {
      id,
      rawText,
      metadata: (() => {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (!isStoredArtifactMetadata(parsed)) {
          throw new Error("invalid artifact metadata");
        }
        return parsed;
      })(),
    };
  } catch {
    return null;
  }
}

export async function listArtifacts(storeDir?: string): Promise<StoredArtifactRef[]> {
  const base = resolveArtifactBaseDir(storeDir);
  try {
    const files = await readdir(base);
    return files
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/u, ""))
      .filter((id) => isValidArtifactId(id))
      .sort()
      .reverse()
      .map((id) => buildArtifactPaths(id, storeDir));
  } catch {
    return [];
  }
}

export async function listArtifactMetadata(storeDir?: string): Promise<ArtifactMetadataRef[]> {
  const entries: ArtifactMetadataRef[] = [];
  let cursor: string | undefined;
  do {
    const page = await listArtifactMetadataPage(storeDir, {
      limit: DEFAULT_METADATA_LIST_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    entries.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor);
  return entries.sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
}

export async function listArtifactMetadataPage(
  storeDir?: string,
  options: ArtifactMetadataPageOptions = {},
): Promise<ArtifactMetadataPage> {
  const page = await readBoundedJsonlPage(
    metadataSegmentDir(storeDir),
    METADATA_SEGMENT_PREFIX,
    isStoredMetadataEvent,
    options,
  );
  const base = resolveArtifactBaseDir(storeDir);
  const entries = page.records
    .map(({ path: metadataPath, value }) => ({
      id: value.id,
      storage: "file" as const,
      ...(value.hasRaw ? { path: join(base, `${value.id}.txt`) } : {}),
      metadataPath,
      metadataFormat: "jsonl-segment" as const,
      metadataRecordId: value.id,
      metadata: value.metadata,
    }))
    .sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
  return {
    entries,
    partial: page.partial,
    legacySidecarsIncluded: false,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}
