import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type MarkerDelimitedBlockConfig = {
  beginMarker: string;
  endMarker: string;
  block: string;
};

export type InstructionFileSnapshot = {
  text: string;
  exists: boolean;
};

export type MarkerDelimitedBlockState = {
  hasBegin: boolean;
  hasEnd: boolean;
  completeBlockCount: number;
};

export type InstallMarkerDelimitedBlockResult = {
  filePath: string;
  backupPath?: string;
};

export type UninstallMarkerDelimitedBlockResult = {
  filePath: string;
  removed: boolean;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildBlockPattern(config: MarkerDelimitedBlockConfig): RegExp {
  return new RegExp(`\\n?${escapeRegExp(config.beginMarker)}[\\s\\S]*?${escapeRegExp(config.endMarker)}\\n?`, "gu");
}

export async function readInstructionFile(filePath: string): Promise<InstructionFileSnapshot> {
  try {
    return { text: await readFile(filePath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

export function inspectMarkerDelimitedBlock(text: string, config: MarkerDelimitedBlockConfig): MarkerDelimitedBlockState {
  return {
    hasBegin: text.includes(config.beginMarker),
    hasEnd: text.includes(config.endMarker),
    completeBlockCount: [...text.matchAll(buildBlockPattern(config))].length,
  };
}

export function removeMarkerDelimitedBlock(text: string, config: MarkerDelimitedBlockConfig): { text: string; removed: boolean } {
  const pattern = buildBlockPattern(config);
  if (!pattern.test(text)) {
    return { text, removed: false };
  }
  return {
    text: text.replace(buildBlockPattern(config), "\n").replace(/\n{3,}/gu, "\n\n").trim(),
    removed: true,
  };
}

export function upsertMarkerDelimitedBlock(text: string, config: MarkerDelimitedBlockConfig): string {
  const withoutBlock = removeMarkerDelimitedBlock(text, config).text.trim();
  if (!withoutBlock) {
    return `${config.block}\n`;
  }
  return `${withoutBlock}\n\n${config.block}\n`;
}

export async function installMarkerDelimitedBlock(filePath: string, config: MarkerDelimitedBlockConfig): Promise<InstallMarkerDelimitedBlockResult> {
  const existing = await readInstructionFile(filePath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${filePath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, upsertMarkerDelimitedBlock(existing.text, config), "utf8");
  await rename(tempPath, filePath);
  return {
    filePath,
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function uninstallMarkerDelimitedBlock(filePath: string, config: MarkerDelimitedBlockConfig): Promise<UninstallMarkerDelimitedBlockResult> {
  const existing = await readInstructionFile(filePath);
  if (!existing.exists) {
    return { filePath, removed: false };
  }
  const removed = removeMarkerDelimitedBlock(existing.text, config);
  if (!removed.removed) {
    return { filePath, removed: false };
  }
  if (removed.text.trim()) {
    await writeFile(filePath, `${removed.text.trim()}\n`, "utf8");
  } else {
    await rm(filePath, { force: true });
  }
  return { filePath, removed: true };
}
