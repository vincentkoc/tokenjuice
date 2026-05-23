import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type LocalCodePluginOptions = {
  homeDir?: string;
};

export type InstallLocalCodePluginResult = {
  pluginDir: string;
  manifestPath: string;
  indexPath: string;
  manifestBackupPath?: string;
  indexBackupPath?: string;
};

export type UninstallLocalCodePluginResult = {
  pluginDir: string;
  manifestPath: string;
  indexPath: string;
  removed: boolean;
};

export type LocalCodeDoctorReport = {
  pluginDir: string;
  manifestPath: string;
  indexPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_LOCALCODE_FIX_COMMAND = "tokenjuice install localcode";
const TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER = "tokenjuice:localcode-plugin";
const TOKENJUICE_LOCALCODE_MANIFEST_RESTORE_MARKER_PREFIX = "tokenjuice:localcode-restore-manifest=";
const TOKENJUICE_LOCALCODE_INDEX_RESTORE_MARKER_PREFIX = "tokenjuice:localcode-restore-index=";
const TOKENJUICE_LOCALCODE_PLUGIN_MARKER = "tokenjuice localcode plugin";
const TOKENJUICE_LOCALCODE_TOOL_NAME = "tokenjuice_compact_terminal_output";
const TOKENJUICE_LOCALCODE_COMMAND = "/tokenjuice";
const TOKENJUICE_LOCALCODE_ADVISORY =
  "LocalCode support is beta and installs a plugin tool/command for compacting provided terminal output; it does not intercept LocalCode's built-in shell output.";

function getLocalCodeHome(options: LocalCodePluginOptions = {}): string {
  return options.homeDir || process.env.LOCALCODE_HOME || join(homedir(), ".localcode");
}

function getPluginDir(options: LocalCodePluginOptions = {}): string {
  return join(getLocalCodeHome(options), "plugins", "tokenjuice");
}

function getManifestPath(options: LocalCodePluginOptions = {}): string {
  return join(getPluginDir(options), "localcode.plugin.json");
}

function getIndexPath(options: LocalCodePluginOptions = {}): string {
  return join(getPluginDir(options), "index.js");
}

async function rejectPluginDirectorySymlink(pluginDir: string): Promise<void> {
  try {
    const stats = await lstat(pluginDir);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use LocalCode plugin directory ${pluginDir}; tokenjuice will not write through plugin directory symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectPluginDirectorySymlinks(options: LocalCodePluginOptions = {}): Promise<void> {
  const localCodeHome = getLocalCodeHome(options);
  for (const directory of [localCodeHome, join(localCodeHome, "plugins"), getPluginDir(options)]) {
    await rejectPluginDirectorySymlink(directory);
  }
}

async function rejectPluginFileSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use LocalCode plugin file ${filePath}; tokenjuice will not read or write through plugin file symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectPluginFileSidecarSymlinks(filePath: string): Promise<void> {
  await rejectPluginFileSymlink(`${filePath}.bak`);
}

async function backupPathExists(backupPath: string): Promise<boolean> {
  try {
    await lstat(backupPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function chooseLocalCodeBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
}

async function writeTextFileWithoutBackup(filePath: string, text: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function readLocalCodePluginFiles(options: LocalCodePluginOptions = {}): Promise<{
  manifest: Awaited<ReturnType<typeof readInstructionFile>>;
  index: Awaited<ReturnType<typeof readInstructionFile>>;
}> {
  return {
    manifest: await readInstructionFile(getManifestPath(options)),
    index: await readInstructionFile(getIndexPath(options)),
  };
}

function hasTokenjuiceMarker(manifestText: string, indexText: string): boolean {
  return manifestText.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER) || indexText.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string, markerPrefix: string): string | undefined {
  const match = text.match(new RegExp(`^// ${markerPrefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(\\.bak(?:\\.\\d+)?)$`, "mu"));
  return match?.[1];
}

function readRestoreBackups(indexText: string): {
  manifestBackupSuffix?: string;
  indexBackupSuffix?: string;
} {
  const manifestBackupSuffix = readRestoreBackupSuffix(indexText, TOKENJUICE_LOCALCODE_MANIFEST_RESTORE_MARKER_PREFIX);
  const indexBackupSuffix = readRestoreBackupSuffix(indexText, TOKENJUICE_LOCALCODE_INDEX_RESTORE_MARKER_PREFIX);
  return {
    ...(manifestBackupSuffix ? { manifestBackupSuffix } : {}),
    ...(indexBackupSuffix ? { indexBackupSuffix } : {}),
  };
}

const TOKENJUICE_LOCALCODE_MANIFEST = JSON.stringify(
  {
    name: "tokenjuice",
    version: "1.0.0",
    description: `${TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER}; ${TOKENJUICE_LOCALCODE_PLUGIN_MARKER}: compact provided terminal output without running commands.`,
    author: "tokenjuice",
    tools: [TOKENJUICE_LOCALCODE_TOOL_NAME],
    commands: [TOKENJUICE_LOCALCODE_COMMAND.trim()],
  },
  null,
  2,
) + "\n";

function buildLocalCodePlugin(
  {
    manifestBackupSuffix,
    indexBackupSuffix,
  }: { manifestBackupSuffix?: string | undefined; indexBackupSuffix?: string | undefined } = {},
): string {
  return [
    `// ${TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER}`,
    ...(manifestBackupSuffix ? [`// ${TOKENJUICE_LOCALCODE_MANIFEST_RESTORE_MARKER_PREFIX}${manifestBackupSuffix}`] : []),
    ...(indexBackupSuffix ? [`// ${TOKENJUICE_LOCALCODE_INDEX_RESTORE_MARKER_PREFIX}${indexBackupSuffix}`] : []),
    "'use strict'",
    "",
    "const { spawnSync } = require('node:child_process')",
    "",
    `const TOKENJUICE_LOCALCODE_PLUGIN_MARKER = '${TOKENJUICE_LOCALCODE_PLUGIN_MARKER}'`,
    `const TOOL_NAME = '${TOKENJUICE_LOCALCODE_TOOL_NAME}'`,
    `const COMMAND_NAME = '${TOKENJUICE_LOCALCODE_COMMAND}'`,
    "const DEFAULT_MAX_INLINE_CHARS = 20000",
    "const DEFAULT_TIMEOUT_MS = 10000",
    "",
    "function readString(value) {",
    "  return typeof value === 'string' ? value : ''",
    "}",
    "",
    "function readInteger(value, fallback) {",
    "  const parsed = Number(value)",
    "  return Number.isInteger(parsed) ? parsed : fallback",
    "}",
    "",
    "function runTokenjuiceReduce({ command, output, exitCode = 0, cwd, maxInlineChars = DEFAULT_MAX_INLINE_CHARS }) {",
    "  const trimmedCommand = readString(command).trim()",
    "  const visibleText = readString(output)",
    "  if (!trimmedCommand) {",
    "    return { ok: false, message: 'command must be a non-empty string; it is metadata only and is never executed by this plugin.' }",
    "  }",
    "  if (!visibleText.trim()) {",
    "    return { ok: false, message: 'output must be non-empty terminal text captured from a prior command.' }",
    "  }",
    "",
    "  const request = {",
    "    input: {",
    "      toolName: 'localcode-plugin',",
    "      command: trimmedCommand,",
    "      combinedText: visibleText,",
    "      exitCode: readInteger(exitCode, 0),",
    "      metadata: { source: 'localcode-plugin' },",
    "    },",
    "    options: {",
    "      maxInlineChars: readInteger(maxInlineChars, DEFAULT_MAX_INLINE_CHARS),",
    "    },",
    "  }",
    "",
    "  const tokenjuiceBin = process.env.TOKENJUICE_BIN || 'tokenjuice'",
    "  const completed = spawnSync(tokenjuiceBin, ['reduce-json'], {",
    "    input: JSON.stringify(request),",
    "    encoding: 'utf8',",
    "    timeout: DEFAULT_TIMEOUT_MS,",
    "    cwd: cwd || process.cwd(),",
    "    shell: false,",
    "    maxBuffer: 1024 * 1024 * 8,",
    "  })",
    "",
    "  if (completed.error) {",
    "    return { ok: false, message: `tokenjuice failed: ${completed.error.message}` }",
    "  }",
    "  if (completed.status !== 0) {",
    "    const details = (completed.stderr || completed.stdout || '').trim()",
    "    return { ok: false, message: `tokenjuice exited ${completed.status}: ${details}` }",
    "  }",
    "",
    "  let result",
    "  try {",
    "    result = JSON.parse(completed.stdout)",
    "  } catch {",
    "    return { ok: false, message: `tokenjuice returned non-JSON output: ${completed.stdout.slice(0, 1000)}` }",
    "  }",
    "",
    "  if (!result || typeof result.inlineText !== 'string') {",
    "    return { ok: false, message: 'tokenjuice returned no inline text.' }",
    "  }",
    "",
    "  const reducer = result.classification && result.classification.matchedReducer ? result.classification.matchedReducer : 'generic/fallback'",
    "  const ratio = result.stats && typeof result.stats.ratio === 'number' ? `, ratio ${Math.round(result.stats.ratio * 100)}%` : ''",
    "  return { ok: true, message: `tokenjuice compacted output (${reducer}${ratio}):\\n\\n${result.inlineText}` }",
    "}",
    "",
    "const commandDefinition = {",
    "  cmd: COMMAND_NAME,",
    "  description: 'Compact provided terminal output with tokenjuice; first line is the command, remaining text is output.',",
    "  async handler(args, ctx) {",
    "    const [commandLine = '', ...outputLines] = readString(args).split(/\\r?\\n/)",
    "    const outcome = runTokenjuiceReduce({",
    "      command: commandLine,",
    "      output: outputLines.join('\\n'),",
    "      cwd: ctx && ctx.cwd,",
    "    })",
    "    return { type: outcome.ok ? 'command' : 'error', title: 'tokenjuice', content: outcome.message }",
    "  },",
    "}",
    "",
    "const toolDefinition = {",
    "  name: TOOL_NAME,",
    "  description: 'Compact terminal output that has already been captured. The command string is metadata only; it is never executed by this tool.',",
    "  async handler(args, ctx) {",
    "    const outcome = runTokenjuiceReduce({",
    "      command: args && args.command,",
    "      output: args && (args.output || args.stdout || args.text),",
    "      exitCode: args && (args.exitCode || args.exit_code),",
    "      maxInlineChars: args && args.maxInlineChars,",
    "      cwd: ctx && ctx.cwd,",
    "    })",
    "    return outcome.ok ? { success: true, output: outcome.message } : { success: false, error: outcome.message, output: '' }",
    "  },",
    "}",
    "",
    "const plugin = {",
    "  name: 'tokenjuice',",
    "  version: '1.0.0',",
    "  description: `${TOKENJUICE_LOCALCODE_PLUGIN_MARKER}: compact provided terminal output without running commands.`,",
    "  commands: [commandDefinition],",
    "  tools: [toolDefinition],",
    "  register(registry) {",
    "    if (registry && typeof registry.addCommand === 'function') {",
    "      registry.addCommand(commandDefinition)",
    "    }",
    "    if (registry && typeof registry.addTool === 'function') {",
    "      registry.addTool({",
    "        name: toolDefinition.name,",
    "        description: toolDefinition.description,",
    "        parameters: {",
    "          type: 'object',",
    "          properties: {",
    "            command: { type: 'string', description: 'Command that produced the output; metadata only.' },",
    "            output: { type: 'string', description: 'Captured terminal output to compact.' },",
    "            exitCode: { type: 'number', description: 'Command exit code, if known.' },",
    "            maxInlineChars: { type: 'number', description: 'Maximum compacted characters to return.' },",
    "          },",
    "          required: ['command', 'output'],",
    "        },",
    "        async execute(args, ctx) {",
    "          const outcome = await toolDefinition.handler(args || {}, ctx || {})",
    "          return outcome.success ? outcome.output : (outcome.error || outcome.output || 'tokenjuice failed')",
    "        },",
    "      })",
    "    }",
    "  },",
    "}",
    "",
    "module.exports = plugin",
    "",
  ].join("\n");
}

export async function installLocalCodePlugin(
  options: LocalCodePluginOptions = {},
): Promise<InstallLocalCodePluginResult> {
  const pluginDir = getPluginDir(options);
  const manifestPath = getManifestPath(options);
  const indexPath = getIndexPath(options);
  await rejectPluginDirectorySymlinks(options);
  await rejectPluginFileSymlink(manifestPath);
  await rejectPluginFileSymlink(indexPath);
  await rejectPluginFileSidecarSymlinks(manifestPath);
  await rejectPluginFileSidecarSymlinks(indexPath);
  const { manifest: existingManifest, index: existingIndex } = await readLocalCodePluginFiles(options);
  if (hasTokenjuiceMarker(existingManifest.text, existingIndex.text)) {
    const restoreBackups = readRestoreBackups(existingIndex.text);
    const manifestBackupPath =
      existingManifest.exists && !existingManifest.text.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER)
        ? await chooseLocalCodeBackupPath(manifestPath)
        : undefined;
    const indexBackupPath =
      existingIndex.exists && !existingIndex.text.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER)
        ? await chooseLocalCodeBackupPath(indexPath)
        : undefined;
    if (manifestBackupPath) {
      await writeFile(manifestBackupPath, existingManifest.text, { encoding: "utf8", flag: "wx" });
    }
    if (indexBackupPath) {
      await writeFile(indexBackupPath, existingIndex.text, { encoding: "utf8", flag: "wx" });
    }
    const nextIndex = buildLocalCodePlugin({
      ...restoreBackups,
      ...(manifestBackupPath ? { manifestBackupSuffix: manifestBackupPath.slice(manifestPath.length) } : {}),
      ...(indexBackupPath ? { indexBackupSuffix: indexBackupPath.slice(indexPath.length) } : {}),
    });
    if (existingManifest.text === TOKENJUICE_LOCALCODE_MANIFEST && existingIndex.text === nextIndex) {
      return { pluginDir, manifestPath, indexPath };
    }
    let manifest: { filePath: string; backupPath?: string };
    if (existingManifest.text === TOKENJUICE_LOCALCODE_MANIFEST) {
      manifest = { filePath: manifestPath };
    } else if (manifestBackupPath) {
      await writeTextFileWithoutBackup(manifestPath, TOKENJUICE_LOCALCODE_MANIFEST);
      manifest = { filePath: manifestPath };
    } else {
      manifest = await writeInstructionFile(manifestPath, TOKENJUICE_LOCALCODE_MANIFEST);
    }
    let index: { filePath: string; backupPath?: string };
    if (existingIndex.text === nextIndex) {
      index = { filePath: indexPath };
    } else if (indexBackupPath) {
      await writeTextFileWithoutBackup(indexPath, nextIndex);
      index = { filePath: indexPath };
    } else {
      index = await writeInstructionFile(indexPath, nextIndex);
    }
    return {
      pluginDir,
      manifestPath: manifest.filePath,
      indexPath: index.filePath,
      ...(manifestBackupPath ? { manifestBackupPath } : manifest.backupPath ? { manifestBackupPath: manifest.backupPath } : {}),
      ...(indexBackupPath ? { indexBackupPath } : index.backupPath ? { indexBackupPath: index.backupPath } : {}),
    };
  }

  const manifestBackupPath = existingManifest.exists ? await chooseLocalCodeBackupPath(manifestPath) : undefined;
  const indexBackupPath = existingIndex.exists ? await chooseLocalCodeBackupPath(indexPath) : undefined;
  if (manifestBackupPath) {
    await writeFile(manifestBackupPath, existingManifest.text, { encoding: "utf8", flag: "wx" });
  }
  if (indexBackupPath) {
    await writeFile(indexBackupPath, existingIndex.text, { encoding: "utf8", flag: "wx" });
  }
  await writeTextFileWithoutBackup(manifestPath, TOKENJUICE_LOCALCODE_MANIFEST);
  await writeTextFileWithoutBackup(
    indexPath,
    buildLocalCodePlugin({
      manifestBackupSuffix: manifestBackupPath ? manifestBackupPath.slice(manifestPath.length) : undefined,
      indexBackupSuffix: indexBackupPath ? indexBackupPath.slice(indexPath.length) : undefined,
    }),
  );
  return {
    pluginDir,
    manifestPath,
    indexPath,
    ...(manifestBackupPath ? { manifestBackupPath } : {}),
    ...(indexBackupPath ? { indexBackupPath } : {}),
  };
}

async function restoreOrRemoveOwnedPluginFile(
  filePath: string,
  existing: Awaited<ReturnType<typeof readInstructionFile>>,
  restoreBackupSuffix: string | undefined,
): Promise<boolean> {
  if (!existing.exists || !existing.text.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER)) {
    return false;
  }
  if (restoreBackupSuffix) {
    const backupPath = `${filePath}${restoreBackupSuffix}`;
    await rejectPluginFileSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !backup.text.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER)) {
      await rm(filePath, { force: true });
      await rename(backupPath, filePath);
      return true;
    }
  }
  const result = await removeInstructionFile(filePath);
  return result.removed;
}

export async function uninstallLocalCodePlugin(
  options: LocalCodePluginOptions = {},
): Promise<UninstallLocalCodePluginResult> {
  const pluginDir = getPluginDir(options);
  const manifestPath = getManifestPath(options);
  const indexPath = getIndexPath(options);
  await rejectPluginDirectorySymlinks(options);
  await rejectPluginFileSymlink(manifestPath);
  await rejectPluginFileSymlink(indexPath);
  const { manifest: existingManifest, index: existingIndex } = await readLocalCodePluginFiles(options);
  if (!hasTokenjuiceMarker(existingManifest.text, existingIndex.text)) {
    return {
      pluginDir,
      manifestPath,
      indexPath,
      removed: false,
    };
  }
  const restoreBackups = readRestoreBackups(existingIndex.text);
  const manifestRemoved = await restoreOrRemoveOwnedPluginFile(manifestPath, existingManifest, restoreBackups.manifestBackupSuffix);
  const indexRemoved = await restoreOrRemoveOwnedPluginFile(indexPath, existingIndex, restoreBackups.indexBackupSuffix);
  if (manifestRemoved || indexRemoved) {
    await rmdir(pluginDir).catch(() => undefined);
  }
  return {
    pluginDir,
    manifestPath,
    indexPath,
    removed: manifestRemoved || indexRemoved,
  };
}

function collectManifestIssues(text: string): string[] {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text) as unknown;
  } catch {
    return ["configured LocalCode plugin manifest is not valid JSON"];
  }
  if (!isRecord(manifest)) {
    return ["configured LocalCode plugin manifest is not an object"];
  }

  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  return [
    ...(text.includes(TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER)
      ? []
      : ["configured LocalCode plugin manifest is missing the tokenjuice ownership marker"]),
    ...(manifest.name === "tokenjuice" ? [] : ["configured LocalCode plugin manifest is missing the tokenjuice plugin name"]),
    ...(manifest.version === "1.0.0" ? [] : ["configured LocalCode plugin manifest is missing the tokenjuice plugin version"]),
    ...(tools.includes(TOKENJUICE_LOCALCODE_TOOL_NAME)
      ? []
      : ["configured LocalCode plugin manifest is missing the tokenjuice compaction tool"]),
    ...(commands.includes(TOKENJUICE_LOCALCODE_COMMAND.trim())
      ? []
      : ["configured LocalCode plugin manifest is missing the tokenjuice slash command"]),
  ];
}

export async function doctorLocalCodePlugin(
  options: LocalCodePluginOptions = {},
): Promise<LocalCodeDoctorReport> {
  const pluginDir = getPluginDir(options);
  const manifestPath = getManifestPath(options);
  const indexPath = getIndexPath(options);
  let manifest: Awaited<ReturnType<typeof readInstructionFile>>;
  let index: Awaited<ReturnType<typeof readInstructionFile>>;
  try {
    await rejectPluginDirectorySymlinks(options);
    await rejectPluginFileSymlink(manifestPath);
    await rejectPluginFileSymlink(indexPath);
    ({ manifest, index } = await readLocalCodePluginFiles(options));
  } catch (error) {
    return {
      pluginDir,
      manifestPath,
      indexPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_LOCALCODE_ADVISORY,
        fixCommand: "replace symlinked LocalCode plugin files with regular files, then run tokenjuice install localcode",
      }),
    };
  }
  const hasMarker = hasTokenjuiceMarker(manifest.text, index.text);

  if (!manifest.exists && !index.exists) {
    return {
      pluginDir,
      manifestPath,
      indexPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice LocalCode plugin is not installed"],
        advisory: TOKENJUICE_LOCALCODE_ADVISORY,
        fixCommand: TOKENJUICE_LOCALCODE_FIX_COMMAND,
      }),
    };
  }
  if (!hasMarker) {
    return {
      pluginDir,
      manifestPath,
      indexPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice LocalCode plugin is not installed; existing plugin files are not tokenjuice-managed"],
        advisory: TOKENJUICE_LOCALCODE_ADVISORY,
        fixCommand: TOKENJUICE_LOCALCODE_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...(manifest.exists ? collectManifestIssues(manifest.text) : ["configured LocalCode plugin manifest is missing"]),
    ...(index.exists
      ? collectGuidanceIssues(index.text, {
          required: [
            {
              requiredText: TOKENJUICE_LOCALCODE_OWNERSHIP_MARKER,
              missingIssue: "configured LocalCode plugin is missing the tokenjuice ownership marker",
            },
            {
              requiredText: TOKENJUICE_LOCALCODE_PLUGIN_MARKER,
              missingIssue: "configured LocalCode plugin does not look like the tokenjuice plugin",
            },
            {
              requiredText: TOKENJUICE_LOCALCODE_TOOL_NAME,
              missingIssue: "configured LocalCode plugin is missing the tokenjuice compaction tool",
            },
            {
              requiredText: "reduce-json",
              missingIssue: "configured LocalCode plugin is missing tokenjuice reduce-json wiring",
            },
            {
              requiredText: "command string is metadata only",
              missingIssue: "configured LocalCode plugin is missing the no-command-execution safety note",
            },
            {
              requiredText: "shell: false",
              missingIssue: "configured LocalCode plugin is missing shell-free tokenjuice execution",
            },
          ],
          forbidden: [
            {
              forbiddenText: "shell: true",
              presentIssue: "configured LocalCode plugin enables shell execution",
            },
            {
              forbiddenText: "execSync(",
              presentIssue: "configured LocalCode plugin uses execSync",
            },
          ],
        })
      : ["configured LocalCode plugin index.js is missing"]),
  ];

  return {
    pluginDir,
    manifestPath,
    indexPath,
    hasTokenjuiceMarker: hasMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_LOCALCODE_ADVISORY,
      fixCommand: TOKENJUICE_LOCALCODE_FIX_COMMAND,
    }),
  };
}
