import { lstat, realpath, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";

export type CodeRabbitConfigOptions = {
  projectDir?: string;
};

export type InstallCodeRabbitConfigResult = {
  configPath: string;
  backupPath?: string;
};

export type UninstallCodeRabbitConfigResult = {
  configPath: string;
  removed: boolean;
};

export type CodeRabbitDoctorReport = {
  configPath: string;
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CODERABBIT_FIX_COMMAND = "tokenjuice install coderabbit";
const TOKENJUICE_CODERABBIT_BEGIN = "# tokenjuice:coderabbit begin";
const TOKENJUICE_CODERABBIT_END = "# tokenjuice:coderabbit end";
const TOKENJUICE_CODERABBIT_ADVISORY =
  "CodeRabbit support is beta and path-instruction based; CodeRabbit still owns pull-request review, tools, and comment delivery.";

function getExplicitProjectDir(options: CodeRabbitConfigOptions = {}): string | undefined {
  return options.projectDir || process.env.CODERABBIT_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: CodeRabbitConfigOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function getExpectedConfigPath(projectDir: string): string {
  return join(projectDir, ".coderabbit.yaml");
}

async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function rejectConfigSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use CodeRabbit config ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectConfigSymlink(`${filePath}.bak`);
  await rejectConfigSymlink(`${filePath}.tmp`);
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use CodeRabbit config ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectConfigPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use CodeRabbit config ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use CodeRabbit config ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectConfigSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectConfigSymlink(resolvedPath);
  const expectedConfigPath = getExpectedConfigPath(projectDir);
  if (resolvedPath !== expectedConfigPath) {
    throw new Error(`cannot use CodeRabbit config ${resolvedPath}; tokenjuice only installs the project-local .coderabbit.yaml config`);
  }
  return resolvedPath;
}

async function getDefaultConfigPath(options: CodeRabbitConfigOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectConfigPath(getExpectedConfigPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: CodeRabbitConfigOptions = {}): Promise<string> {
  return getExpectedConfigPath(await resolveProjectDir(options));
}

async function pathExistsWithoutReading(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function resolveConfigPath(configPath?: string, options: CodeRabbitConfigOptions = {}): Promise<string> {
  if (configPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectConfigPath(configPath, projectDir, realProjectDir);
  }
  return getDefaultConfigPath(options);
}

function getYamlLineIndent(line: string): number {
  return line.match(/^\s*/u)?.[0].length ?? 0;
}

function getYamlStructureLines(lines: readonly string[]): string[] {
  const structureLines: string[] = [];
  let blockScalarIndent: number | undefined;
  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (blockScalarIndent !== undefined) {
      if (line.trim() === "") {
        structureLines.push("");
        continue;
      }
      if (getYamlLineIndent(line) > blockScalarIndent) {
        structureLines.push("");
        continue;
      }
      blockScalarIndent = undefined;
    }

    structureLines.push(line);
    if (/:\s*[|>](?:[+-]?[1-9]?|[1-9][+-]?)(?:\s+#.*)?$/u.test(line)) {
      blockScalarIndent = getYamlLineIndent(line);
    }
  }
  return structureLines;
}

function getStructuralMarkerLines(text: string, marker: string): { lines: string[]; markerLines: number[] } {
  const lines = text.split("\n");
  const structureLines = getYamlStructureLines(lines);
  return {
    lines,
    markerLines: structureLines.flatMap((line, index) => (line.trim() === marker ? [index] : [])),
  };
}

function findTokenjuiceBlockLineRange(text: string): { lines: string[]; start: number; end: number } | undefined {
  const begin = getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_END);
  if (begin.markerLines.length !== 1 || end.markerLines.length !== 1 || end.markerLines[0]! < begin.markerLines[0]!) {
    return undefined;
  }
  return {
    lines: begin.lines,
    start: begin.markerLines[0]!,
    end: end.markerLines[0]! + 1,
  };
}

function hasMalformedMarkerStructure(text: string): boolean {
  const begin = getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_END);
  const beginCount = begin.markerLines.length;
  const endCount = end.markerLines.length;
  return beginCount !== endCount || beginCount > 1 || endCount > 1 || (beginCount === 1 && end.markerLines[0]! < begin.markerLines[0]!);
}

function hasStructuralTokenjuiceMarker(text: string): boolean {
  return getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_BEGIN).markerLines.length > 0 || getStructuralMarkerLines(text, TOKENJUICE_CODERABBIT_END).markerLines.length > 0;
}

function hasTokenjuiceBlock(text: string): boolean {
  return Boolean(findTokenjuiceBlockLineRange(text));
}

function getTokenjuiceBlockText(text: string): string {
  const range = findTokenjuiceBlockLineRange(text);
  if (!range) {
    return "";
  }
  return range.lines.slice(range.start, range.end).join("\n");
}

function removeTokenjuiceBlock(text: string): { text: string; removed: boolean } {
  const range = findTokenjuiceBlockLineRange(text);
  if (!range) {
    return { text, removed: false };
  }

  const before = range.lines.slice(0, range.start);
  const after = range.lines.slice(range.end);
  const afterHasContent = after.some((line) => line.trim() !== "");
  const needsBoundaryBlank = before.length > 0 && afterHasContent && before.at(-1) !== "" && after[0] !== "";
  const next = [...before, ...(needsBoundaryBlank ? [""] : []), ...(afterHasContent ? after : [])];
  return {
    text: next.join("\n"),
    removed: true,
  };
}

function countTopLevelKey(lines: readonly string[], key: string): number {
  return getYamlStructureLines(lines).filter((line) => new RegExp(`^${key}:`, "u").test(line)).length;
}

const YAML_KEY_TOKEN = String.raw`(?:"(?:[^"\\]|\\.)+"|'[^']+'|[^\s:#-][^:#]*?)`;
const YAML_NODE_PROPERTY_TOKEN = String.raw`(?:&[^\s#,\[\]\{\}]+|![^\s#,\[\]\{\}]+|!<[^>\n]+>)`;

function stripYamlComment(value: string): string {
  const commentIndex = value.search(/\s+#/u);
  return commentIndex === -1 ? value.trim() : value.slice(0, commentIndex).trim();
}

function isYamlBlockMappingSuffix(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return true;
  }
  const withoutComment = stripYamlComment(trimmed);
  if (!withoutComment) {
    return true;
  }
  return new RegExp(`^${YAML_NODE_PROPERTY_TOKEN}(?:\\s+${YAML_NODE_PROPERTY_TOKEN})*$`, "u").test(withoutComment);
}

function findTopLevelMappingRange(lines: readonly string[], key: string): { start: number; end: number } | undefined {
  const structureLines = getYamlStructureLines(lines);
  const start = structureLines.findIndex((line) => {
    const match = new RegExp(`^${key}:\\s*(.*)$`, "u").exec(line);
    return Boolean(match && isYamlBlockMappingSuffix(match[1] ?? ""));
  });
  if (start === -1) {
    return undefined;
  }
  const nextTopLevel = structureLines
    .slice(start + 1)
    .findIndex((line) => new RegExp(`^${YAML_KEY_TOKEN}\\s*:`, "u").test(line));
  return {
    start,
    end: nextTopLevel === -1 ? lines.length : start + 1 + nextTopLevel,
  };
}

function findNestedMappingRange(
  lines: readonly string[],
  parentRange: { start: number; end: number },
  key: string,
  indent: number,
): { start: number; end: number } | undefined {
  const structureLines = getYamlStructureLines(lines);
  const prefix = " ".repeat(indent);
  const start = structureLines
    .slice(parentRange.start + 1, parentRange.end)
    .findIndex((line) => {
      const match = new RegExp(`^${prefix}${key}:\\s*(.*)$`, "u").exec(line);
      return Boolean(match && isYamlBlockMappingSuffix(match[1] ?? ""));
    });
  if (start === -1) {
    return undefined;
  }
  const absoluteStart = parentRange.start + 1 + start;
  const nextSibling = structureLines
    .slice(absoluteStart + 1, parentRange.end)
    .findIndex((line) => new RegExp(`^${prefix}${YAML_KEY_TOKEN}\\s*:`, "u").test(line));
  return {
    start: absoluteStart,
    end: nextSibling === -1 ? parentRange.end : absoluteStart + 1 + nextSibling,
  };
}

function findNestedKeyOccurrences(
  lines: readonly string[],
  parentRange: { start: number; end: number },
  key: string,
): Array<{ indent: number; value: string }> {
  const structureLines = getYamlStructureLines(lines);
  const keyPattern = new RegExp(`^(\\s+)${key}:\\s*(.*)$`, "u");
  return structureLines
    .slice(parentRange.start + 1, parentRange.end)
    .flatMap((line) => {
      const match = line.match(keyPattern);
      if (!match) {
        return [];
      }
      return [{ indent: match[1]?.length ?? 0, value: match[2] ?? "" }];
    });
}

function assertSupportedYamlShape(text: string, configPath: string): void {
  const lines = getYamlStructureLines(text.split("\n"));
  const unsupportedReviewsKey = lines.some(
    (line) => /^(?:"reviews"|'reviews'|reviews)\s*:/u.test(line) && !/^reviews:\s*/u.test(line),
  );
  if (unsupportedReviewsKey) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} uses an unsupported root reviews key shape; convert it to a plain reviews mapping, then rerun tokenjuice install coderabbit`,
    );
  }
  if (countTopLevelKey(lines, "reviews") > 1) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} has multiple top-level reviews keys; merge them manually, then rerun tokenjuice install coderabbit`,
    );
  }
  const inlineReviews = lines.some((line) => {
    const match = /^reviews:\s*(.*)$/u.exec(line);
    return Boolean(match && !isYamlBlockMappingSuffix(match[1] ?? ""));
  });
  if (inlineReviews) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} defines reviews as an inline YAML value; convert it to a reviews mapping, then rerun tokenjuice install coderabbit`,
    );
  }

  const reviewsRange = findTopLevelMappingRange(lines, "reviews");
  if (!reviewsRange) {
    return;
  }
  const firstReviewsContent = lines
    .slice(reviewsRange.start + 1, reviewsRange.end)
    .find((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  if (firstReviewsContent && !/^ {2}\S/u.test(firstReviewsContent)) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} uses unsupported indentation inside reviews; convert reviews to two-space child indentation, then rerun tokenjuice install coderabbit`,
    );
  }
  const unsupportedPathInstructionsKey = lines
    .slice(reviewsRange.start + 1, reviewsRange.end)
    .some(
      (line) =>
        /^ {2}(?:"path_instructions"|'path_instructions'|path_instructions)\s*:/u.test(line) &&
        !/^  path_instructions:\s*/u.test(line),
    );
  if (unsupportedPathInstructionsKey) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} uses an unsupported reviews.path_instructions key shape; convert it to a two-space reviews.path_instructions block, then rerun tokenjuice install coderabbit`,
    );
  }
  const pathInstructionsKeys = findNestedKeyOccurrences(lines, reviewsRange, "path_instructions");
  const directPathInstructionsKeys = pathInstructionsKeys.filter(({ indent }) => indent === 2);
  const duplicatePathInstructions = directPathInstructionsKeys.length > 1;
  if (duplicatePathInstructions) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} has multiple reviews.path_instructions keys; merge them manually, then rerun tokenjuice install coderabbit`,
    );
  }
  const inlinePathInstructions = directPathInstructionsKeys.some(({ value }) => !isYamlBlockMappingSuffix(value));
  if (inlinePathInstructions) {
    throw new Error(
      `cannot install CodeRabbit guidance because ${configPath} defines reviews.path_instructions as an inline YAML value; convert it to a block list, then rerun tokenjuice install coderabbit`,
    );
  }
  const pathInstructionsRange = findNestedMappingRange(lines, reviewsRange, "path_instructions", 2);
  if (pathInstructionsRange) {
    const firstPathInstructionsContent = lines
      .slice(pathInstructionsRange.start + 1, pathInstructionsRange.end)
      .find((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
    if (firstPathInstructionsContent && !/^ {4}-\s/u.test(firstPathInstructionsContent)) {
      throw new Error(
        `cannot install CodeRabbit guidance because ${configPath} defines reviews.path_instructions as a non-list YAML block; convert it to a block list, then rerun tokenjuice install coderabbit`,
      );
    }
  }
}

function collectSupportedYamlShapeIssues(text: string, configPath: string): string[] {
  try {
    assertSupportedYamlShape(text, configPath);
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
}

function collectTokenjuiceBlockPlacementIssues(text: string): string[] {
  const lines = text.split("\n");
  const blockRange = findTokenjuiceBlockLineRange(text);
  if (!blockRange) {
    return ["configured CodeRabbit review guidance is not installed under reviews.path_instructions"];
  }
  const beginLine = blockRange.start;
  const endLine = blockRange.end - 1;
  const reviewsRange = findTopLevelMappingRange(lines, "reviews");
  if (!reviewsRange) {
    return ["configured CodeRabbit review guidance is not installed under reviews.path_instructions"];
  }
  const pathInstructionsRange = findNestedMappingRange(lines, reviewsRange, "path_instructions", 2);
  if (!pathInstructionsRange) {
    return ["configured CodeRabbit review guidance is not installed under reviews.path_instructions"];
  }
  const isInsidePathInstructions =
    beginLine > pathInstructionsRange.start && endLine > beginLine && endLine < pathInstructionsRange.end;
  const hasListEntry = getYamlStructureLines(lines)
    .slice(beginLine + 1, endLine)
    .some((line) => /^ {4}-\s+path\s*:/u.test(line));
  if (!isInsidePathInstructions || !hasListEntry) {
    return ["configured CodeRabbit review guidance is not installed as a reviews.path_instructions entry"];
  }
  return [];
}

const TOKENJUICE_CODERABBIT_GUIDANCE = [
  "tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When CodeRabbit review, finishing-touch, chat, or tool workflows suggest terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
];

function createPathInstructionBlock(indent: number): string[] {
  const prefix = " ".repeat(indent);
  return [
    `${prefix}${TOKENJUICE_CODERABBIT_BEGIN}`,
    `${prefix}- path: "**/*"`,
    `${prefix}  instructions: |`,
    ...TOKENJUICE_CODERABBIT_GUIDANCE.map((line) => `${prefix}    ${line}`),
    `${prefix}${TOKENJUICE_CODERABBIT_END}`,
  ];
}

function createPathInstructionsBlock(indent: number): string[] {
  const prefix = " ".repeat(indent);
  return [`${prefix}path_instructions:`, ...createPathInstructionBlock(indent + 2)];
}

function installTokenjuiceBlock(text: string, configPath: string): string {
  const withoutTokenjuice = removeTokenjuiceBlock(text).text;
  assertSupportedYamlShape(withoutTokenjuice, configPath);
  const lines = withoutTokenjuice ? withoutTokenjuice.split("\n") : [];
  const reviewsRange = findTopLevelMappingRange(lines, "reviews");
  if (!reviewsRange) {
    return `${withoutTokenjuice}${withoutTokenjuice ? "\n\n" : ""}reviews:\n${createPathInstructionsBlock(2).join("\n")}\n`;
  }

  const pathInstructionsRange = findNestedMappingRange(lines, reviewsRange, "path_instructions", 2);
  if (!pathInstructionsRange) {
    const next = [
      ...lines.slice(0, reviewsRange.end),
      ...(reviewsRange.end > reviewsRange.start + 1 ? [""] : []),
      ...createPathInstructionsBlock(2),
      ...((reviewsRange.end < lines.length && lines[reviewsRange.end] !== "") ? [""] : []),
      ...lines.slice(reviewsRange.end),
    ];
    return `${next.join("\n")}\n`;
  }

  const next = [
    ...lines.slice(0, pathInstructionsRange.end),
    ...createPathInstructionBlock(4),
    ...((pathInstructionsRange.end < lines.length && lines[pathInstructionsRange.end] !== "") ? [""] : []),
    ...lines.slice(pathInstructionsRange.end),
  ];
  return `${next.join("\n")}\n`;
}

function removeEmptyCodeRabbitContainers(text: string): string {
  if (!text.trim()) {
    return "";
  }
  let lines = text.split("\n");
  const reviewsRange = findTopLevelMappingRange(lines, "reviews");
  if (!reviewsRange) {
    return text;
  }
  const pathInstructionsRange = findNestedMappingRange(lines, reviewsRange, "path_instructions", 2);
  if (pathInstructionsRange) {
    const pathBody = lines.slice(pathInstructionsRange.start + 1, pathInstructionsRange.end).join("\n").trim();
    if (!pathBody) {
      lines = [...lines.slice(0, pathInstructionsRange.start), ...lines.slice(pathInstructionsRange.end)];
    }
  }

  const refreshedReviewsRange = findTopLevelMappingRange(lines, "reviews");
  if (!refreshedReviewsRange) {
    return lines.join("\n");
  }
  const reviewsBody = lines.slice(refreshedReviewsRange.start + 1, refreshedReviewsRange.end).join("\n").trim();
  if (reviewsBody) {
    return lines.join("\n");
  }
  return [...lines.slice(0, refreshedReviewsRange.start), ...lines.slice(refreshedReviewsRange.end)]
    .join("\n");
}

export async function installCodeRabbitConfig(
  configPath?: string,
  options: CodeRabbitConfigOptions = {},
): Promise<InstallCodeRabbitConfigResult> {
  const resolvedConfigPath = await resolveConfigPath(configPath, options);
  await rejectInstallSidecarSymlinks(resolvedConfigPath);
  const existing = await readInstructionFile(resolvedConfigPath);
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice CodeRabbit markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice install coderabbit`,
    );
  }

  const result = await writeInstructionFile(resolvedConfigPath, installTokenjuiceBlock(existing.text, resolvedConfigPath));
  return {
    configPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallCodeRabbitConfig(
  configPath?: string,
  options: CodeRabbitConfigOptions = {},
): Promise<UninstallCodeRabbitConfigResult> {
  const resolvedConfigPath = await resolveConfigPath(configPath, options);
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists) {
    return { configPath: resolvedConfigPath, removed: false };
  }
  if (hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice CodeRabbit markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice uninstall coderabbit`,
    );
  }
  const result = removeTokenjuiceBlock(existing.text);
  if (result.removed) {
    const nextText = removeEmptyCodeRabbitContainers(result.text);
    if (nextText.trim()) {
      await writeInstructionFile(resolvedConfigPath, `${nextText}\n`);
    } else {
      await rm(resolvedConfigPath, { force: true });
    }
  }
  return { configPath: resolvedConfigPath, removed: result.removed };
}

export async function doctorCodeRabbitConfig(
  configPath?: string,
  options: CodeRabbitConfigOptions = {},
): Promise<CodeRabbitDoctorReport> {
  let resolvedConfigPath: string;
  try {
    resolvedConfigPath = await resolveConfigPath(configPath, options);
  } catch (error) {
    const aliasPath = configPath ?? (await getDefaultAliasPath(options));
    if (!configPath && !(await pathExistsWithoutReading(aliasPath))) {
      return {
        configPath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice CodeRabbit review guidance is not installed"],
          advisory: TOKENJUICE_CODERABBIT_ADVISORY,
          fixCommand: TOKENJUICE_CODERABBIT_FIX_COMMAND,
        }),
      };
    }
    return {
      configPath: aliasPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_CODERABBIT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .coderabbit.yaml path, then run tokenjuice install coderabbit"
          : "replace symlinked CodeRabbit config with a regular project file, then run tokenjuice install coderabbit",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedConfigPath);
  const hasTokenjuiceMarker = hasStructuralTokenjuiceMarker(existing.text);
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: ["configured CodeRabbit config has unmatched or duplicate tokenjuice markers"],
        advisory: TOKENJUICE_CODERABBIT_ADVISORY,
        fixCommand: "remove unmatched tokenjuice markers from .coderabbit.yaml, then run tokenjuice install coderabbit",
      }),
    };
  }
  if (!existing.exists || !hasTokenjuiceBlock(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice CodeRabbit review guidance is not installed"],
        advisory: TOKENJUICE_CODERABBIT_ADVISORY,
        fixCommand: TOKENJUICE_CODERABBIT_FIX_COMMAND,
      }),
    };
  }

  const structuralIssues = [
    ...collectSupportedYamlShapeIssues(existing.text, resolvedConfigPath),
    ...collectTokenjuiceBlockPlacementIssues(existing.text),
  ];
  const issues = [
    ...structuralIssues,
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured CodeRabbit review guidance is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured CodeRabbit review guidance is missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured CodeRabbit review guidance still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    configPath: resolvedConfigPath,
    hasTokenjuiceMarker,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CODERABBIT_ADVISORY,
      fixCommand: structuralIssues.length > 0
        ? "move tokenjuice CodeRabbit guidance under reviews.path_instructions, then run tokenjuice install coderabbit"
        : TOKENJUICE_CODERABBIT_FIX_COMMAND,
    }),
  };
}
