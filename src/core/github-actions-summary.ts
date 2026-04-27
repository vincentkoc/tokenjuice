import type { ToolExecutionInput } from "../types.js";

import { createCompactionMetadata, type CompactionMetadata } from "./compaction-metadata.js";
import { normalizeLines, stripAnsi, trimEmptyEdges } from "./text.js";

const GITHUB_ACTIONS_EXIT_PATTERN = /^Error: Process completed with exit code (\d+)\.?$/u;
const GITHUB_ACTIONS_RUN_PATTERN = /^(?:##\[group\]|::group::)?Run\s+(.+)$/u;
const MAX_LISTED_COMMANDS = 24;

function isGithubActionsMetadataLine(line: string): boolean {
  return (
    line === "##[endgroup]"
    || line.startsWith("shell:")
    || line.startsWith("env:")
    || line.startsWith("Error: Process completed with exit code ")
  );
}

function isShellSetupLine(line: string): boolean {
  return (
    line === "set -e"
    || line === "set -eo pipefail"
    || line === "set -euo pipefail"
    || /^set\s+-[A-Za-z]*e[A-Za-z]*$/u.test(line)
  );
}

function stripGithubActionsScriptPrefix(line: string): string {
  return line
    .replace(/^\s{2}/u, "")
    .replace(/^\t/u, "")
    .trim();
}

function dedupeAdjacent(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    if (deduped[deduped.length - 1] !== value) {
      deduped.push(value);
    }
  }
  return deduped;
}

function extractRunCommands(lines: string[]): string[] {
  const runIndex = lines.findIndex((line) => GITHUB_ACTIONS_RUN_PATTERN.test(stripGithubActionsScriptPrefix(line)));
  if (runIndex === -1) {
    return [];
  }

  const commands: string[] = [];
  const runMatch = stripGithubActionsScriptPrefix(lines[runIndex] ?? "").match(GITHUB_ACTIONS_RUN_PATTERN);
  if (runMatch?.[1]) {
    commands.push(runMatch[1].trim());
  }

  const bodyLines = lines.slice(runIndex + 1);
  const hasIndentedScriptBody = bodyLines.some((line) => /^(?:\s{2}|\t)\S/u.test(line));
  for (const rawLine of bodyLines) {
    if (hasIndentedScriptBody && !/^(?:\s{2}|\t)/u.test(rawLine)) {
      break;
    }

    const line = stripGithubActionsScriptPrefix(rawLine);
    if (!line || isGithubActionsMetadataLine(line)) {
      break;
    }
    commands.push(line);
  }

  return dedupeAdjacent(commands).filter((line) => !isShellSetupLine(line));
}

function formatCommandList(commands: string[]): { lines: string[]; compaction?: CompactionMetadata } {
  if (commands.length <= MAX_LISTED_COMMANDS) {
    return { lines: commands.map((command) => `- ${command}`) };
  }

  const headCount = Math.floor(MAX_LISTED_COMMANDS * 0.65);
  const tailCount = MAX_LISTED_COMMANDS - headCount;
  const omitted = commands.length - headCount - tailCount;
  return {
    lines: [
      ...commands.slice(0, headCount).map((command) => `- ${command}`),
      `... ${omitted} commands omitted ...`,
      ...commands.slice(-tailCount).map((command) => `- ${command}`),
    ],
    compaction: createCompactionMetadata("github-actions-command-list-omission"),
  };
}

export function buildGithubActionsFailureSummary(input: ToolExecutionInput, rawText: string): { text: string; compaction?: CompactionMetadata } | null {
  const lines = trimEmptyEdges(normalizeLines(stripAnsi(rawText))).map((line) => line.trimEnd());
  const exitLine = [...lines].reverse().find((line) => GITHUB_ACTIONS_EXIT_PATTERN.test(stripGithubActionsScriptPrefix(line)));
  const exitCode = exitLine?.match(GITHUB_ACTIONS_EXIT_PATTERN)?.[1] ?? (input.exitCode && input.exitCode !== 0 ? String(input.exitCode) : null);
  if (!exitLine || !exitCode) {
    return null;
  }

  const commands = extractRunCommands(lines);
  if (commands.length === 0) {
    return null;
  }

  const commandList = formatCommandList(commands);
  const summary = [`GitHub Actions shell step failed (exit ${exitCode}).`];
  if (commands.length === 1) {
    summary.push(`Failing command: ${commands[0]}`);
  } else {
    summary.push(`Failing command: not visible; this shell step ran ${commands.length} commands without per-command failure markers.`);
    summary.push("Commands in step:");
    summary.push(...commandList.lines);
  }
  summary.push(stripGithubActionsScriptPrefix(exitLine));
  return {
    text: summary.join("\n"),
    ...(commandList.compaction ? { compaction: commandList.compaction } : {}),
  };
}
