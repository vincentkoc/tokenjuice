import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { countTextChars, stripAnsi } from "./text.js";

import type { ArtifactMetadataRef, StoredArtifact, StoredArtifactInput, StoredArtifactMetadata, StoredArtifactRef } from "../types.js";

function artifactBaseDir(storeDir?: string): string {
  return storeDir ?? join(homedir(), ".tokenjuice", "artifacts");
}

function buildArtifactPaths(id: string, storeDir?: string): StoredArtifactRef {
  const base = artifactBaseDir(storeDir);
  return {
    id,
    storage: "file",
    path: join(base, `${id}.txt`),
    metadataPath: join(base, `${id}.json`),
  };
}

export async function storeArtifact(input: StoredArtifactInput, storeDir?: string): Promise<StoredArtifactRef> {
  const id = `tj_${randomUUID().slice(0, 12)}`;
  const ref = buildArtifactPaths(id, storeDir);
  await mkdir(artifactBaseDir(storeDir), { recursive: true });

  const artifact: StoredArtifact = {
    id,
    rawText: input.rawText,
    metadata: {
      createdAt: new Date().toISOString(),
      classification: input.classification,
      rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
      ...(input.input.toolName ? { toolName: input.input.toolName } : {}),
      ...(input.input.command ? { command: input.input.command } : {}),
      ...(typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {}),
      ...(input.stats ? { reducedChars: input.stats.reducedChars, ratio: input.stats.ratio } : {}),
    },
  };

  await Promise.all([
    writeFile(ref.path, input.rawText, "utf8"),
    writeFile(ref.metadataPath, JSON.stringify(artifact.metadata, null, 2), "utf8"),
  ]);

  return ref;
}

export async function getArtifact(id: string, storeDir?: string): Promise<StoredArtifact | null> {
  const ref = buildArtifactPaths(id, storeDir);
  try {
    const [rawText, metadataRaw] = await Promise.all([
      readFile(ref.path, "utf8"),
      readFile(ref.metadataPath, "utf8"),
    ]);
    return {
      id,
      rawText,
      metadata: JSON.parse(metadataRaw) as StoredArtifact["metadata"],
    };
  } catch {
    return null;
  }
}

export async function listArtifacts(storeDir?: string): Promise<StoredArtifactRef[]> {
  const base = artifactBaseDir(storeDir);
  try {
    const files = await readdir(base);
    return files
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/u, ""))
      .sort()
      .reverse()
      .map((id) => buildArtifactPaths(id, storeDir));
  } catch {
    return [];
  }
}

export async function listArtifactMetadata(storeDir?: string): Promise<ArtifactMetadataRef[]> {
  const refs = await listArtifacts(storeDir);
  const metadata = await Promise.all(
    refs.map(async (ref) => {
      try {
        const raw = await readFile(ref.metadataPath, "utf8");
        return {
          ...ref,
          metadata: JSON.parse(raw) as StoredArtifactMetadata,
        };
      } catch {
        return null;
      }
    }),
  );

  return metadata.filter((entry): entry is ArtifactMetadataRef => entry !== null);
}
