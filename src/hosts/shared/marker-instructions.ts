import { rm, writeFile } from "node:fs/promises";

import { readInstructionFile, writeInstructionFile } from "./instruction-file.js";

export type MarkerDelimitedBlockConfig = {
  beginMarker: string;
  endMarker: string;
  block: string;
};

export type MarkerDelimitedBlockState = {
  hasBegin: boolean;
  hasEnd: boolean;
  completeBlockCount: number;
};

export type MarkerDelimitedBlockIssueOptions = {
  configuredLabel: string;
  repairCommand: string;
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

export function inspectMarkerDelimitedBlock(text: string, config: MarkerDelimitedBlockConfig): MarkerDelimitedBlockState {
  return {
    hasBegin: text.includes(config.beginMarker),
    hasEnd: text.includes(config.endMarker),
    completeBlockCount: [...text.matchAll(buildBlockPattern(config))].length,
  };
}

export function collectMarkerDelimitedBlockIssues(
  state: MarkerDelimitedBlockState,
  options: MarkerDelimitedBlockIssueOptions,
): string[] {
  if (state.hasBegin && !state.hasEnd) {
    return [`configured ${options.configuredLabel} have a tokenjuice start marker without an end marker`];
  }
  if (!state.hasBegin && state.hasEnd) {
    return [`configured ${options.configuredLabel} have a tokenjuice end marker without a start marker`];
  }
  if (state.completeBlockCount !== 1) {
    return [`configured ${options.configuredLabel} have multiple tokenjuice blocks; run ${options.repairCommand} to repair`];
  }
  return [];
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
  const result = await writeInstructionFile(filePath, upsertMarkerDelimitedBlock(existing.text, config));
  return {
    filePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
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
