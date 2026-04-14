import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { StoredArtifact, StoredArtifactInput, StoredArtifactRef } from "../types.js";

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
      rawChars: input.rawText.length,
      ...(input.input.command ? { command: input.input.command } : {}),
      ...(typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {}),
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
