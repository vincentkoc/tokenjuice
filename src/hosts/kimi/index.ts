import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import type { HookCommandDoctorReport } from "../shared/hook-command-doctor.js";

export type KimiHookCommandOptions = TokenjuiceHookCommandOptions & {
  configDir?: string;
};

export type InstallKimiHookResult = {
  configPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallKimiHookResult = {
  configPath: string;
  removed: number;
};

export type KimiDoctorReport = HookCommandDoctorReport<"configPath"> & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_KIMI_BEGIN = "# tokenjuice:kimi begin";
const TOKENJUICE_KIMI_END = "# tokenjuice:kimi end";
const TOKENJUICE_KIMI_RETIRED =
  "Kimi automatic compaction is unavailable: PostToolUse hooks cannot replace tool output. Use tokenjuice wrap -- <command>.";

async function getDefaultConfigPath(options: KimiHookCommandOptions = {}): Promise<string> {
  const configDir = options.configDir || process.env.KIMI_CODE_HOME || process.env.KIMI_SHARE_DIR || process.env.KIMI_HOME;
  if (configDir) return join(configDir, "config.toml");
  const current = join(homedir(), ".kimi-code", "config.toml");
  const legacy = join(homedir(), ".kimi", "config.toml");
  // Find an old installation for cleanup without creating or migrating host config.
  for (const path of [current, legacy]) {
    const { text } = await readConfig(path);
    if (text.includes(TOKENJUICE_KIMI_BEGIN) || text.includes(TOKENJUICE_KIMI_END)) return path;
  }
  return current;
}

async function readConfig(configPath: string): Promise<{ text: string; exists: boolean }> {
  try {
    return { text: await readFile(configPath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

function hasMalformedMarkerStructure(text: string): boolean {
  let offset = 0;
  let hasOpenBlock = false;
  while (offset < text.length) {
    const beginIndex = text.indexOf(TOKENJUICE_KIMI_BEGIN, offset);
    const endIndex = text.indexOf(TOKENJUICE_KIMI_END, offset);
    if (beginIndex === -1 && endIndex === -1) {
      break;
    }
    if (beginIndex !== -1 && (endIndex === -1 || beginIndex < endIndex)) {
      if (hasOpenBlock) {
        return true;
      }
      hasOpenBlock = true;
      offset = beginIndex + TOKENJUICE_KIMI_BEGIN.length;
    } else {
      if (!hasOpenBlock) {
        return true;
      }
      hasOpenBlock = false;
      offset = endIndex + TOKENJUICE_KIMI_END.length;
    }
  }
  return hasOpenBlock;
}

function removeKimiHookBlock(text: string): { text: string; removed: number } {
  let remaining = text;
  let removed = 0;
  while (true) {
    const beginIndex = remaining.indexOf(TOKENJUICE_KIMI_BEGIN);
    if (beginIndex === -1) {
      break;
    }
    const endIndex = remaining.indexOf(TOKENJUICE_KIMI_END, beginIndex + TOKENJUICE_KIMI_BEGIN.length);
    if (endIndex === -1) {
      break;
    }
    const afterEndIndex = endIndex + TOKENJUICE_KIMI_END.length;
    const nextIndex = remaining[afterEndIndex] === "\n" ? afterEndIndex + 1 : afterEndIndex;
    remaining = `${remaining.slice(0, beginIndex)}${remaining.slice(nextIndex)}`;
    removed += 1;
  }
  return { text: remaining.trimEnd(), removed };
}

async function writeConfig(configPath: string, text: string): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: fsConstants.S_IRWXU });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, text, {
    encoding: "utf8",
    mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR,
  });
  await rename(tempPath, configPath);
  await chmod(configPath, fsConstants.S_IRUSR | fsConstants.S_IWUSR);
}

function getKimiHookBlock(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_KIMI_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_KIMI_END, beginIndex + TOKENJUICE_KIMI_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_KIMI_END.length);
}

function findTokenjuiceKimiHookCommand(text: string): string | undefined {
  const block = getKimiHookBlock(text);
  const match = /^\s*command\s*=\s*("(?:\\.|[^"\\])*")\s*$/mu.exec(block);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

/** @deprecated Kimi's observation-only hooks cannot compact model-visible output. */
export async function installKimiHook(
  _configPath?: string,
  _options: KimiHookCommandOptions = {},
): Promise<InstallKimiHookResult> {
  throw new Error(TOKENJUICE_KIMI_RETIRED);
}

export async function uninstallKimiHook(configPath?: string): Promise<UninstallKimiHookResult> {
  configPath ??= await getDefaultConfigPath();
  const existing = await readConfig(configPath);
  if (!existing.exists) {
    return { configPath, removed: 0 };
  }
  if (hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice Kimi markers in ${configPath}; remove the dangling marker manually, then rerun tokenjuice uninstall kimi`,
    );
  }
  const result = removeKimiHookBlock(existing.text);
  if (result.removed > 0) {
    await writeConfig(configPath, result.text ? `${result.text}\n` : "");
  }
  return { configPath, removed: result.removed };
}

export async function doctorKimiHook(
  configPath?: string,
  options: KimiHookCommandOptions = {},
): Promise<KimiDoctorReport> {
  const resolvedConfigPath = configPath ?? await getDefaultConfigPath(options);
  const existing = await readConfig(resolvedConfigPath);
  const hasTokenjuiceMarker = existing.text.includes(TOKENJUICE_KIMI_BEGIN) || existing.text.includes(TOKENJUICE_KIMI_END);
  const detectedCommand = findTokenjuiceKimiHookCommand(existing.text);
  const malformed = hasMalformedMarkerStructure(existing.text);
  return {
    configPath: resolvedConfigPath,
    status: hasTokenjuiceMarker ? "broken" : "disabled",
    hasTokenjuiceMarker,
    expectedCommand: "tokenjuice wrap -- <command>",
    ...(detectedCommand ? { detectedCommand } : {}),
    issues: malformed
      ? ["configured Kimi config has unmatched tokenjuice markers"]
      : hasTokenjuiceMarker ? ["retired tokenjuice Kimi hook is still installed"] : [],
    advisories: [TOKENJUICE_KIMI_RETIRED],
    fixCommand: malformed
      ? "remove unmatched tokenjuice Kimi markers from config.toml"
      : hasTokenjuiceMarker ? "tokenjuice uninstall kimi" : "tokenjuice wrap -- <command>",
    checkedPaths: [resolvedConfigPath],
    missingPaths: existing.exists ? [] : [resolvedConfigPath],
  };
}

/** Keep existing hook commands harmless until users remove their old configuration. */
export async function runKimiPostToolUseHook(_rawText: string): Promise<number> {
  return 0;
}
