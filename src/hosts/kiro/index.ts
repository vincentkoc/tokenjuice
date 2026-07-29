import { join } from "node:path";

import { parseShellWords, shellQuote } from "../shared/hook-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  isRecord,
  resolveHostShell,
  type WrapLauncherOptions,
} from "../shared/pre-tool-wrap.js";

export type KiroSteeringOptions = {
  projectDir?: string;
};

export type KiroHookOptions = KiroSteeringOptions & WrapLauncherOptions;

export type InstallKiroSteeringResult = {
  steeringPath: string;
  backupPath?: string;
};

export type UninstallKiroSteeringResult = {
  steeringPath: string;
  removed: boolean;
};

export type InstallKiroHookResult = {
  agentPath: string;
  steeringPath: string;
  command: string;
  agentBackupPath?: string;
  steeringBackupPath?: string;
};

export type UninstallKiroHookResult = {
  agentPath: string;
  steeringPath: string;
  removedAgent: boolean;
  removedSteering: boolean;
};

export type KiroDoctorReport = {
  steeringPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

export type KiroHookDoctorReport = KiroDoctorReport & {
  agentPath: string;
  expectedCommand: string;
  detectedCommand?: string;
};

type KiroAgentHook = {
  matcher?: unknown;
  command?: unknown;
  timeout_ms?: unknown;
  cache_ttl_seconds?: unknown;
};

type KiroAgentConfig = {
  name?: unknown;
  description?: unknown;
  tools?: unknown;
  hooks?: {
    preToolUse?: unknown;
  };
};

type KiroPreToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
};

const TOKENJUICE_KIRO_FIX_COMMAND = "tokenjuice install kiro";
const TOKENJUICE_KIRO_STEERING_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_KIRO_AGENT_MARKER = "tokenjuice native shell guard";
const TOKENJUICE_KIRO_HOOK_TIMEOUT_MS = 5_000;
const TOKENJUICE_KIRO_ADVISORY = "Kiro steering provides retry guidance; native enforcement requires the tokenjuice custom agent.";
const TOKENJUICE_KIRO_HOOK_ADVISORY = "Kiro 2.x hooks cannot rewrite tool input, so the native PreToolUse guard blocks unwrapped shell commands and asks the agent to retry through tokenjuice.";
const KIRO_SHELL_TOOL_NAMES = new Set(["shell", "execute_bash", "execute_cmd"]);

function getProjectDir(options: KiroSteeringOptions = {}): string {
  return options.projectDir || process.env.KIRO_PROJECT_DIR || process.cwd();
}

function getDefaultSteeringPath(options: KiroSteeringOptions = {}): string {
  return join(getProjectDir(options), ".kiro", "steering", "tokenjuice.md");
}

function getDefaultAgentPath(options: KiroSteeringOptions = {}): string {
  return join(getProjectDir(options), ".kiro", "agents", "tokenjuice.json");
}

function getKiroFixCommand(local = false): string {
  return local ? `${TOKENJUICE_KIRO_FIX_COMMAND} --local` : TOKENJUICE_KIRO_FIX_COMMAND;
}

async function buildKiroHookCommand(options: WrapLauncherOptions = {}): Promise<string> {
  return await buildWrapLauncherHookCommand({
    ...options,
    subcommand: "kiro-pre-tool-use",
    hostName: "Kiro",
  });
}

const TOKENJUICE_KIRO_STEERING = [
  "---",
  "inclusion: always",
  "---",
  "",
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Kiro, always use \`${TOKENJUICE_WRAP_COMMAND}\`; the tokenjuice Kiro agent blocks unwrapped shell commands.`,
  }),
  "- Start Kiro CLI with `kiro-cli chat --agent tokenjuice` to enable the native PreToolUse guard.",
  "- If the guard blocks a command, retry with the exact wrapped command from the hook error.",
  "",
].join("\n");

function createKiroAgent(command: string): KiroAgentConfig {
  return {
    name: "tokenjuice",
    description: `${TOKENJUICE_KIRO_AGENT_MARKER}; requires shell commands to run through tokenjuice wrap`,
    tools: ["@builtin"],
    hooks: {
      preToolUse: [
        {
          matcher: "shell",
          command,
          timeout_ms: TOKENJUICE_KIRO_HOOK_TIMEOUT_MS,
          cache_ttl_seconds: 0,
        },
      ],
    },
  };
}

function hasAlwaysIncludedFrontmatter(text: string): boolean {
  const frontmatterStart = text.match(/^---\r?\n/u);
  if (!frontmatterStart) {
    return false;
  }
  const endIndex = text.search(/\r?\n---(?:\r?\n|$)/u);
  if (endIndex === -1) {
    return false;
  }
  const frontmatter = text.slice(frontmatterStart[0].length, endIndex);
  return frontmatter.split(/\r?\n/u).some((line) => line.trim() === "inclusion: always");
}

function parseKiroAgent(text: string): KiroAgentConfig | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed as KiroAgentConfig : undefined;
  } catch {
    return undefined;
  }
}

function isTokenjuiceKiroAgent(config: KiroAgentConfig | undefined): boolean {
  return config?.name === "tokenjuice"
    && typeof config.description === "string"
    && config.description.includes(TOKENJUICE_KIRO_AGENT_MARKER);
}

function getKiroPreToolHooks(config: KiroAgentConfig): KiroAgentHook[] {
  const hooks = config.hooks?.preToolUse;
  if (!Array.isArray(hooks)) {
    return [];
  }
  return hooks.filter(isRecord) as KiroAgentHook[];
}

function findTokenjuiceKiroHook(config: KiroAgentConfig): KiroAgentHook | undefined {
  return getKiroPreToolHooks(config).find(
    (hook) => typeof hook.command === "string" && hook.command.includes("kiro-pre-tool-use"),
  );
}

function containsUnsafeOuterShellSyntax(command: string, platform: NodeJS.Platform = process.platform): boolean {
  if (command.includes("\n") || command.includes("\r")) {
    return true;
  }

  let quote: "'" | "\"" | null = null;
  let escaping = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    const next = command[index + 1];

    if (escaping) {
      escaping = false;
      continue;
    }
    if (platform !== "win32" && quote !== "'" && char === "\\") {
      escaping = true;
      continue;
    }
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      }
      continue;
    }
    // cmd.exe treats single quotes as ordinary characters, so accepting them
    // as quoting on Windows would hide outer operators from the guard.
    if (platform !== "win32" && quote === null && char === "'") {
      quote = "'";
      continue;
    }
    if (char === "\"") {
      quote = quote === "\"" ? null : "\"";
      continue;
    }
    if (char === "`" || (char === "$" && next === "(")) {
      return true;
    }
    if (quote === null && ";|&<>()".includes(char)) {
      return true;
    }
  }

  return quote !== null || escaping;
}

function getConfiguredWrapPrefix(wrapLauncher: string, nodePath = process.execPath): string[] {
  return wrapLauncher.endsWith(".js")
    ? [nodePath, wrapLauncher, "wrap"]
    : [wrapLauncher, "wrap"];
}

function getConfiguredWrapCommand(
  wrapLauncher: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  nodePath = process.execPath,
): string {
  return [...getConfiguredWrapPrefix(wrapLauncher, nodePath), ...args]
    .map((value) => shellQuote(value, platform))
    .join(" ");
}

function getWrapperArgs(command: string, platform: NodeJS.Platform = process.platform): string[] | undefined {
  if (containsUnsafeOuterShellSyntax(command, platform)) {
    return undefined;
  }
  const argv = parseShellWords(command, platform);
  const wrapIndex = argv.indexOf("wrap");
  const looksLikeDirectWrapper = wrapIndex === 1;
  const looksLikeNodeWrapper = wrapIndex === 2 && argv[1]?.endsWith(".js");
  if (!looksLikeDirectWrapper && !looksLikeNodeWrapper) {
    return undefined;
  }
  const separatorIndex = argv.indexOf("--", wrapIndex + 1);
  if (separatorIndex <= wrapIndex || separatorIndex >= argv.length - 1) {
    return undefined;
  }
  return argv.slice(wrapIndex + 1);
}

function isSafelyWrappedKiroCommand(
  command: string,
  wrapLauncher: string,
  platform: NodeJS.Platform = process.platform,
  nodePath = process.execPath,
): boolean {
  if (containsUnsafeOuterShellSyntax(command, platform)) {
    return false;
  }

  const argv = parseShellWords(command, platform);
  const expectedPrefix = getConfiguredWrapPrefix(wrapLauncher, nodePath);
  if (argv.length <= expectedPrefix.length) {
    return false;
  }
  if (!expectedPrefix.every((token, index) => argv[index] === token)) {
    return false;
  }

  const wrapIndex = expectedPrefix.length - 1;
  const separatorIndex = argv.indexOf("--", wrapIndex + 1);
  return separatorIndex > wrapIndex && separatorIndex < argv.length - 1;
}

async function resolveKiroHostShell(): Promise<string | undefined> {
  return await resolveHostShell([
    process.env.TOKENJUICE_KIRO_SHELL,
    process.env.SHELL,
    "bash",
    "sh",
  ]);
}

function writeKiroBlock(message: string): number {
  process.stderr.write(`${message}\n`);
  return 2;
}

export async function installKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<InstallKiroSteeringResult> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const result = await writeInstructionFile(resolvedSteeringPath, TOKENJUICE_KIRO_STEERING);
  return {
    steeringPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<UninstallKiroSteeringResult> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const existing = await readInstructionFile(resolvedSteeringPath);
  if (existing.exists && !existing.text.includes(TOKENJUICE_KIRO_STEERING_MARKER)) {
    return { steeringPath: resolvedSteeringPath, removed: false };
  }
  const result = existing.exists
    ? await removeInstructionFile(resolvedSteeringPath)
    : { filePath: resolvedSteeringPath, removed: false };
  return { steeringPath: result.filePath, removed: result.removed };
}

export async function installKiroHook(
  agentPath?: string,
  options: KiroHookOptions = {},
): Promise<InstallKiroHookResult> {
  const resolvedAgentPath = agentPath ?? getDefaultAgentPath(options);
  const command = await buildKiroHookCommand(options);
  const agentResult = await writeInstructionFile(
    resolvedAgentPath,
    `${JSON.stringify(createKiroAgent(command), null, 2)}\n`,
  );
  const steeringResult = await installKiroSteering(undefined, options);

  return {
    agentPath: agentResult.filePath,
    steeringPath: steeringResult.steeringPath,
    command,
    ...(agentResult.backupPath ? { agentBackupPath: agentResult.backupPath } : {}),
    ...(steeringResult.backupPath ? { steeringBackupPath: steeringResult.backupPath } : {}),
  };
}

export async function uninstallKiroHook(
  agentPath?: string,
  options: KiroSteeringOptions = {},
): Promise<UninstallKiroHookResult> {
  const resolvedAgentPath = agentPath ?? getDefaultAgentPath(options);
  const existing = await readInstructionFile(resolvedAgentPath);
  let removedAgent = false;
  if (existing.exists) {
    const config = parseKiroAgent(existing.text);
    if (isTokenjuiceKiroAgent(config)) {
      removedAgent = (await removeInstructionFile(resolvedAgentPath)).removed;
    }
  }
  const steering = await uninstallKiroSteering(undefined, options);

  return {
    agentPath: resolvedAgentPath,
    steeringPath: steering.steeringPath,
    removedAgent,
    removedSteering: steering.removed,
  };
}

export async function doctorKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<KiroDoctorReport> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const existing = await readInstructionFile(resolvedSteeringPath);
  if (!existing.exists || !existing.text.includes(TOKENJUICE_KIRO_STEERING_MARKER)) {
    return {
      steeringPath: resolvedSteeringPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Kiro steering file is not installed"],
        advisory: TOKENJUICE_KIRO_ADVISORY,
        fixCommand: TOKENJUICE_KIRO_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_KIRO_STEERING_MARKER,
        missingIssue: "configured Kiro steering file does not look like the tokenjuice steering file",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Kiro steering file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Kiro steering file is missing the raw escape hatch",
      },
      {
        requiredText: "kiro-cli chat --agent tokenjuice",
        missingIssue: "configured Kiro steering file is missing native agent activation guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Kiro steering file still suggests the full escape hatch",
      },
    ],
  });
  if (!hasAlwaysIncludedFrontmatter(existing.text)) {
    issues.push("configured Kiro steering file is missing always-included front matter");
  }

  return {
    steeringPath: resolvedSteeringPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_KIRO_ADVISORY,
      fixCommand: TOKENJUICE_KIRO_FIX_COMMAND,
    }),
  };
}

export async function doctorKiroHook(
  agentPath?: string,
  options: KiroHookOptions = {},
): Promise<KiroHookDoctorReport> {
  const resolvedAgentPath = agentPath ?? getDefaultAgentPath(options);
  const steeringPath = getDefaultSteeringPath(options);
  const expectedCommand = await buildKiroHookCommand(options);
  const fixCommand = getKiroFixCommand(options.local);
  const existing = await readInstructionFile(resolvedAgentPath);

  if (!existing.exists) {
    return {
      agentPath: resolvedAgentPath,
      steeringPath,
      status: "disabled",
      issues: ["tokenjuice Kiro native agent is not installed"],
      advisories: [TOKENJUICE_KIRO_HOOK_ADVISORY],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const config = parseKiroAgent(existing.text);
  if (!config) {
    return {
      agentPath: resolvedAgentPath,
      steeringPath,
      status: "broken",
      issues: ["configured Kiro tokenjuice agent is not valid JSON"],
      advisories: [TOKENJUICE_KIRO_HOOK_ADVISORY],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }
  if (!isTokenjuiceKiroAgent(config)) {
    return {
      agentPath: resolvedAgentPath,
      steeringPath,
      status: "disabled",
      issues: ["tokenjuice Kiro native agent is not installed at the configured path"],
      advisories: [TOKENJUICE_KIRO_HOOK_ADVISORY],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const hook = findTokenjuiceKiroHook(config);
  const detectedCommand = typeof hook?.command === "string" ? hook.command : undefined;
  const commandDoctor = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand,
    disabledIssue: "configured Kiro tokenjuice agent is missing its native PreToolUse hook",
    hostLabel: "Kiro",
    advisory: TOKENJUICE_KIRO_HOOK_ADVISORY,
    fixCommand,
  });
  const issues = [...commandDoctor.issues];
  if (!hook) {
    issues.push("configured Kiro tokenjuice agent is missing its native PreToolUse hook");
  } else {
    if (hook.matcher !== "shell") {
      issues.push("configured Kiro tokenjuice hook matcher must target the shell tool");
    }
    if (hook.timeout_ms !== TOKENJUICE_KIRO_HOOK_TIMEOUT_MS) {
      issues.push(`configured Kiro tokenjuice hook timeout must be ${TOKENJUICE_KIRO_HOOK_TIMEOUT_MS}ms`);
    }
    if (hook.cache_ttl_seconds !== 0) {
      issues.push("configured Kiro tokenjuice hook must disable result caching");
    }
  }
  if (!Array.isArray(config.tools) || !config.tools.includes("@builtin")) {
    issues.push("configured Kiro tokenjuice agent must enable Kiro built-in tools");
  }

  const steeringDoctor = await doctorKiroSteering(undefined, options);
  if (steeringDoctor.status !== "ok") {
    issues.push(...steeringDoctor.issues);
  }

  return {
    agentPath: resolvedAgentPath,
    steeringPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [TOKENJUICE_KIRO_HOOK_ADVISORY],
    fixCommand,
    expectedCommand,
    ...(detectedCommand ? { detectedCommand } : {}),
    checkedPaths: commandDoctor.checkedPaths,
    missingPaths: commandDoctor.missingPaths,
  };
}

export async function runKiroPreToolUseHook(
  rawText: string,
  wrapLauncher = "tokenjuice",
  platform: NodeJS.Platform = process.platform,
  nodePath = process.execPath,
): Promise<number> {
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawText) as unknown;
  } catch {
    return writeKiroBlock("tokenjuice Kiro hook blocked a shell command because the hook payload was not valid JSON.");
  }
  // Kiro recognizes exit code 2 as a block, so reject valid non-object JSON
  // here instead of letting property access throw and turn the guard fail-open.
  if (!isRecord(parsedPayload)) {
    return writeKiroBlock("tokenjuice Kiro hook blocked a shell command because the hook payload was not a JSON object.");
  }
  const payload: KiroPreToolUsePayload = parsedPayload;

  if (payload.hook_event_name !== "preToolUse") {
    return 0;
  }
  if (typeof payload.tool_name !== "string" || !KIRO_SHELL_TOOL_NAMES.has(payload.tool_name)) {
    return 0;
  }
  if (!isRecord(payload.tool_input)) {
    return writeKiroBlock("tokenjuice Kiro hook blocked a shell command because tool_input was missing.");
  }

  const command = typeof payload.tool_input.command === "string" ? payload.tool_input.command : undefined;
  if (!command?.trim()) {
    return writeKiroBlock("tokenjuice Kiro hook blocked a shell command because tool_input.command was missing.");
  }
  if (isSafelyWrappedKiroCommand(command, wrapLauncher, platform, nodePath)) {
    return 0;
  }

  const wrapperArgs = getWrapperArgs(command, platform);
  if (wrapperArgs) {
    return writeKiroBlock(
      `tokenjuice Kiro hook blocked a command that used an untrusted wrapper launcher. Retry exactly as:\n${getConfiguredWrapCommand(wrapLauncher, wrapperArgs, platform, nodePath)}`,
    );
  }

  const shellPath = await resolveKiroHostShell();
  if (!shellPath) {
    return writeKiroBlock(
      `tokenjuice Kiro hook blocked an unwrapped shell command. Retry with: ${TOKENJUICE_WRAP_COMMAND}`,
    );
  }

  const wrappedCommand = buildWrappedCommand({
    wrapLauncher,
    shellPath,
    command,
    source: "kiro",
  });
  return writeKiroBlock(
    `tokenjuice Kiro hook blocked an unwrapped shell command. Retry exactly as:\n${wrappedCommand}`,
  );
}
