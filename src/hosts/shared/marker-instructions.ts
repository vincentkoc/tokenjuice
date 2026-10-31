import { rm, writeFile } from "node:fs/promises";

import { readInstructionFile, writeInstructionFile } from "./instruction-file.js";

export type MarkerDelimitedBlockConfig = {
  beginMarker: string;
  endMarker: string;
  block: string;
  preserveSurroundingText?: boolean;
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

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

export function getMarkerDelimitedBlockText(text: string, config: Pick<MarkerDelimitedBlockConfig, "beginMarker" | "endMarker">): string {
  const beginIndex = text.indexOf(config.beginMarker);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(config.endMarker, beginIndex + config.beginMarker.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + config.endMarker.length);
}

export function hasMalformedMarkerDelimitedBlock(text: string, completeBlockCount: number, config: Pick<MarkerDelimitedBlockConfig, "beginMarker" | "endMarker">): boolean {
  const beginCount = countMarker(text, config.beginMarker);
  const endCount = countMarker(text, config.endMarker);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildBlockPattern(config: MarkerDelimitedBlockConfig): RegExp {
  return new RegExp(`\\n?${escapeRegExp(config.beginMarker)}[\\s\\S]*?${escapeRegExp(config.endMarker)}\\n?`, "gu");
}

function buildExactBlockPattern(config: MarkerDelimitedBlockConfig): RegExp {
  return new RegExp(`${escapeRegExp(config.beginMarker)}[\\s\\S]*?${escapeRegExp(config.endMarker)}`, "gu");
}

export function inspectMarkerDelimitedBlock(text: string, config: MarkerDelimitedBlockConfig): MarkerDelimitedBlockState {
  return {
    hasBegin: text.includes(config.beginMarker),
    hasEnd: text.includes(config.endMarker),
    completeBlockCount: [...text.matchAll(config.preserveSurroundingText ? buildExactBlockPattern(config) : buildBlockPattern(config))].length,
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
  if (config.preserveSurroundingText) {
    const firstMatch = buildExactBlockPattern(config).exec(text);
    if (!firstMatch) {
      return { text, removed: false };
    }
    let nextText = text.replace(buildExactBlockPattern(config), "");
    if (firstMatch.index === 0 && nextText.startsWith("\n")) {
      nextText = nextText.slice(1);
    }
    return { text: nextText, removed: true };
  }

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
  if (config.preserveSurroundingText) {
    const withoutBlock = removeMarkerDelimitedBlock(text, config).text;
    return `${config.block}\n${withoutBlock}`;
  }

  const withoutBlock = removeMarkerDelimitedBlock(text, config).text.trim();
  if (!withoutBlock) {
    return `${config.block}\n`;
  }
  return `${withoutBlock}\n\n${config.block}\n`;
}

export async function installMarkerDelimitedBlock(filePath: string, config: MarkerDelimitedBlockConfig): Promise<InstallMarkerDelimitedBlockResult> {
  const existing = await readInstructionFile(filePath);
  const nextText = upsertMarkerDelimitedBlock(existing.text, config);
  if (existing.exists && existing.text === nextText) {
    return { filePath };
  }

  const result = await writeInstructionFile(filePath, nextText);
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
  if (config.preserveSurroundingText) {
    if (removed.text) {
      await writeFile(filePath, removed.text, "utf8");
    } else {
      await rm(filePath, { force: true });
    }
    return { filePath, removed: true };
  }
  if (removed.text.trim()) {
    await writeFile(filePath, `${removed.text.trim()}\n`, "utf8");
  } else {
    await rm(filePath, { force: true });
  }
  return { filePath, removed: true };
}

export function createMarkerInstructionCommands(host: string, config: MarkerDelimitedBlockConfig) {
  async function rejectMalformedMarkers(instructionsPath: string, action: "install" | "uninstall"): Promise<void> {
    const existing = await readInstructionFile(instructionsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, config);
    if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, config)) {
      throw new Error(
        `cannot safely ${action === "install" ? "repair" : "uninstall"} malformed tokenjuice markers in ${instructionsPath}; remove the dangling marker manually, then rerun tokenjuice ${action} ${host}`,
      );
    }
  }

  return {
    async install(instructionsPath: string) {
      await rejectMalformedMarkers(instructionsPath, "install");
      const result = await installMarkerDelimitedBlock(instructionsPath, config);
      return {
        instructionsPath: result.filePath,
        ...(result.backupPath ? { backupPath: result.backupPath } : {}),
      };
    },
    async uninstall(instructionsPath: string) {
      await rejectMalformedMarkers(instructionsPath, "uninstall");
      const result = await uninstallMarkerDelimitedBlock(instructionsPath, config);
      return { instructionsPath: result.filePath, removed: result.removed };
    },
  };
}
