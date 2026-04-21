#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SESSION_LIMIT = 20;
const DEFAULT_TOP = 15;
const TOKEN_COUNT_PATTERN = /Original token count: (\d+)/g;
const EXIT_CODE_PATTERN = /Process exited with code (\d+)/;
const SESSION_ID_PATTERN = /session ID (\d+)/;
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/;
const SECRET_ASSIGNMENT_PATTERN = /\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))=([^\s]+)/g;
const SECRET_VALUE_PATTERN = /\bsk-[A-Za-z0-9._-]+\b/g;
const TOOL_FAILURE_PATTERN = /^(?:[a-z_]+) failed:/u;

function parseArgs(argv) {
  const options = {
    codexHome: join(homedir(), ".codex"),
    format: "text",
    sessionLimit: DEFAULT_SESSION_LIMIT,
    top: DEFAULT_TOP,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--codex-home":
        if (!next) {
          throw new Error("--codex-home requires a value");
        }
        options.codexHome = next;
        index += 1;
        break;
      case "--format":
        if (next !== "text" && next !== "json") {
          throw new Error("--format must be text or json");
        }
        options.format = next;
        index += 1;
        break;
      case "--sessions":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--sessions requires a positive integer");
        }
        options.sessionLimit = Number(next);
        index += 1;
        break;
      case "--top":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--top requires a positive integer");
        }
        options.top = Number(next);
        index += 1;
        break;
      default:
        throw new Error(`unknown flag: ${current}`);
    }
  }

  return options;
}

async function listFilesRecursive(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function sanitizeCommand(command) {
  return command
    .replace(SECRET_ASSIGNMENT_PATTERN, (_, name) => `${name}=<redacted>`)
    .replace(SECRET_VALUE_PATTERN, "<redacted>");
}

function commandHead(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return "<empty>";
  }

  const parts = trimmed.split(/\s+/u);
  for (const part of parts) {
    if (ENV_ASSIGNMENT_PATTERN.test(part)) {
      continue;
    }
    return part;
  }

  return parts[0] ?? "<empty>";
}

function createRollup() {
  return {
    calls: 0,
    chunks: 0,
    tokens: 0,
    nonzero: 0,
    errors: 0,
    maxTokens: 0,
    exits: new Map(),
    errorSnippets: new Map(),
  };
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortMapEntries(map, limit, by = "value") {
  const entries = [...map.entries()];
  entries.sort((left, right) => {
    if (by === "value") {
      return right[1] - left[1] || String(left[0]).localeCompare(String(right[0]));
    }
    return String(left[0]).localeCompare(String(right[0]));
  });
  return entries.slice(0, limit);
}

function finalizeRollup(rollup) {
  return {
    calls: rollup.calls,
    chunks: rollup.chunks,
    tokens: rollup.tokens,
    nonzero: rollup.nonzero,
    errors: rollup.errors,
    maxTokens: rollup.maxTokens,
    exits: Object.fromEntries([...rollup.exits.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))),
    errorSnippets: sortMapEntries(rollup.errorSnippets, 3).map(([snippet, count]) => ({ count, snippet })),
  };
}

function parseTokenCount(output) {
  let total = 0;
  let match = TOKEN_COUNT_PATTERN.exec(output);
  while (match) {
    total += Number(match[1]);
    match = TOKEN_COUNT_PATTERN.exec(output);
  }
  TOKEN_COUNT_PATTERN.lastIndex = 0;
  return total;
}

function updateRollup(rollup, output) {
  const tokens = parseTokenCount(output);
  const chunkCount = [...output.matchAll(TOKEN_COUNT_PATTERN)].length;
  const exitCode = EXIT_CODE_PATTERN.exec(output);

  rollup.chunks += chunkCount;
  rollup.tokens += tokens;
  rollup.maxTokens = Math.max(rollup.maxTokens, tokens);

  if (exitCode) {
    incrementMap(rollup.exits, exitCode[1]);
    if (exitCode[1] !== "0") {
      rollup.nonzero += 1;
    }
  }

  if (TOOL_FAILURE_PATTERN.test(output)) {
    rollup.errors += 1;
    incrementMap(rollup.errorSnippets, output.replace(/\s+/gu, " ").trim().slice(0, 160));
  }
}

function toSortedObjects(map, limit, projector) {
  return [...map.entries()]
    .sort((left, right) => {
      const valueDiff = projector(right[1]).primary - projector(left[1]).primary;
      if (valueDiff !== 0) {
        return valueDiff;
      }
      return projector(right[1]).secondary - projector(left[1]).secondary;
    })
    .slice(0, limit)
    .map(([key, value]) => projector(value, key).value);
}

async function analyzeSessions(codexHome, limit, top) {
  const sessionsRoot = join(codexHome, "sessions");
  const sessionFiles = (await listFilesRecursive(sessionsRoot))
    .filter((path) => path.endsWith(".jsonl"))
    .sort()
    .slice(-limit);

  const callInfo = new Map();
  const toolSessionCommands = new Map();
  const heads = new Map();
  const commands = new Map();

  for (const file of sessionFiles) {
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type !== "response_item") {
        continue;
      }

      const payload = entry.payload ?? {};
      if (payload.type === "function_call") {
        if (payload.name === "exec_command") {
          let argumentsObject = {};
          try {
            argumentsObject = JSON.parse(payload.arguments ?? "{}");
          } catch {
            argumentsObject = {};
          }

          const rawCommand = String(argumentsObject.cmd ?? "");
          const normalizedCommand = sanitizeCommand(rawCommand);
          const head = commandHead(normalizedCommand);
          callInfo.set(payload.call_id, {
            tool: "exec_command",
            command: normalizedCommand,
            head,
          });

          const headRollup = heads.get(head) ?? createRollup();
          headRollup.calls += 1;
          heads.set(head, headRollup);

          const commandRollup = commands.get(normalizedCommand) ?? createRollup();
          commandRollup.calls += 1;
          commands.set(normalizedCommand, commandRollup);
        } else if (payload.name === "write_stdin") {
          let argumentsObject = {};
          try {
            argumentsObject = JSON.parse(payload.arguments ?? "{}");
          } catch {
            argumentsObject = {};
          }

          callInfo.set(payload.call_id, {
            tool: "write_stdin",
            sessionId: String(argumentsObject.session_id ?? ""),
          });
        }
        continue;
      }

      if (payload.type !== "function_call_output") {
        continue;
      }

      const info = callInfo.get(payload.call_id);
      if (!info) {
        continue;
      }

      const output = String(payload.output ?? "");
      const sessionMatch = SESSION_ID_PATTERN.exec(output);
      if (sessionMatch && info.command) {
        toolSessionCommands.set(sessionMatch[1], info.command);
      }

      const command = info.command ?? toolSessionCommands.get(info.sessionId ?? "");
      if (!command) {
        continue;
      }

      const head = commandHead(command);
      const headRollup = heads.get(head) ?? createRollup();
      updateRollup(headRollup, output);
      heads.set(head, headRollup);

      const commandRollup = commands.get(command) ?? createRollup();
      updateRollup(commandRollup, output);
      commands.set(command, commandRollup);
    }
  }

  const headObjects = toSortedObjects(heads, top, (value, key) => ({
    primary: value.tokens,
    secondary: value.calls,
    value: {
      head: key,
      ...finalizeRollup(value),
    },
  }));

  const commandObjects = toSortedObjects(commands, top, (value, key) => ({
    primary: value.tokens,
    secondary: value.calls,
    value: {
      command: key,
      ...finalizeRollup(value),
    },
  }));

  const failingCommands = [...commands.entries()]
    .filter(([, value]) => value.nonzero > 0)
    .sort((left, right) => right[1].nonzero - left[1].nonzero || right[1].tokens - left[1].tokens)
    .slice(0, top)
    .map(([command, value]) => ({
      command,
      ...finalizeRollup(value),
    }));

  const errorCommands = [...commands.entries()]
    .filter(([, value]) => value.errors > 0)
    .sort((left, right) => right[1].errors - left[1].errors || right[1].tokens - left[1].tokens)
    .slice(0, top)
    .map(([command, value]) => ({
      command,
      ...finalizeRollup(value),
    }));

  return {
    sessionFilesAnalyzed: sessionFiles.length,
    heads: headObjects,
    commands: commandObjects,
    failingCommands,
    errorCommands,
  };
}

function hookCommandHead(command) {
  return commandHead(sanitizeCommand(command ?? ""));
}

async function analyzeHookHistory(codexHome, top) {
  const path = join(codexHome, "tokenjuice-hook.history.jsonl");
  const content = await readFile(path, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const skipped = new Map();
  const reducers = new Map();
  const commandHeads = new Map();
  const weakReducers = [];
  const weakExamples = [];
  let rewrote = 0;
  let rawChars = 0;
  let reducedChars = 0;

  for (const entry of entries) {
    const raw = Number(entry.rawChars ?? 0);
    const reduced = Number(entry.reducedChars ?? raw);
    const ratio = raw > 0 ? reduced / raw : 1;
    const matchedReducer = entry.matchedReducer ?? "<none>";
    const skippedReason = entry.skipped ?? "<none>";
    const head = hookCommandHead(entry.command ?? "");

    rawChars += raw;
    reducedChars += reduced;
    rewrote += entry.rewrote ? 1 : 0;
    incrementMap(skipped, skippedReason);
    incrementMap(reducers, matchedReducer);

    const existing = commandHeads.get(head) ?? {
      count: 0,
      rewrote: 0,
      rawChars: 0,
      reducedChars: 0,
      savedChars: 0,
      reducers: new Map(),
      skipped: new Map(),
    };

    existing.count += 1;
    existing.rewrote += entry.rewrote ? 1 : 0;
    existing.rawChars += raw;
    existing.reducedChars += reduced;
    existing.savedChars += Math.max(raw - reduced, 0);
    incrementMap(existing.reducers, matchedReducer);
    incrementMap(existing.skipped, skippedReason);
    commandHeads.set(head, existing);

    if (matchedReducer !== "<none>" && matchedReducer !== "generic/fallback" && raw >= 500 && ratio >= 0.65) {
      weakReducers.push({ reducer: matchedReducer, ratio, rawChars: raw, command: sanitizeCommand(String(entry.command ?? "")) });
    }

    if (raw > 0 && reduced >= raw) {
      weakExamples.push({
        reducer: matchedReducer,
        ratio,
        savedChars: raw - reduced,
        command: sanitizeCommand(String(entry.command ?? "")),
      });
    }
  }

  const commandHeadObjects = [...commandHeads.entries()]
    .sort((left, right) => right[1].savedChars - left[1].savedChars || right[1].count - left[1].count)
    .slice(0, top)
    .map(([head, value]) => ({
      head,
      count: value.count,
      rewriteRate: value.count > 0 ? value.rewrote / value.count : 0,
      rawChars: value.rawChars,
      reducedChars: value.reducedChars,
      savedChars: value.savedChars,
      reducers: sortMapEntries(value.reducers, 2).map(([reducer, count]) => ({ reducer, count })),
      skipped: sortMapEntries(value.skipped, 2).map(([reason, count]) => ({ reason, count })),
    }));

  return {
    path,
    entries: entries.length,
    rewrote,
    rewriteRate: entries.length > 0 ? rewrote / entries.length : 0,
    rawChars,
    reducedChars,
    savedChars: Math.max(rawChars - reducedChars, 0),
    avgRatio: rawChars > 0 ? reducedChars / rawChars : 1,
    skipped: sortMapEntries(skipped, top).map(([reason, count]) => ({ reason, count })),
    reducers: sortMapEntries(reducers, top).map(([reducer, count]) => ({ reducer, count })),
    weakReducers: weakReducers
      .sort((left, right) => right.ratio - left.ratio || right.rawChars - left.rawChars)
      .slice(0, top),
    noGainExamples: weakExamples
      .sort((left, right) => right.ratio - left.ratio || right.savedChars - left.savedChars)
      .slice(0, top),
    commandHeads: commandHeadObjects,
  };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function printSection(title) {
  process.stdout.write(`\n## ${title}\n`);
}

function printRows(rows, formatter) {
  if (rows.length === 0) {
    process.stdout.write("none\n");
    return;
  }
  for (const row of rows) {
    process.stdout.write(`${formatter(row)}\n`);
  }
}

function emitText(report) {
  process.stdout.write(`# codex telemetry audit\n`);
  process.stdout.write(`codex home: ${report.codexHome}\n`);
  process.stdout.write(`session files: ${report.sessions.sessionFilesAnalyzed}\n`);
  process.stdout.write(`hook history: ${report.hookHistory.entries} entries\n`);

  printSection("Top Heads By Tokens");
  printRows(report.sessions.heads, (row) =>
    `${row.head} calls=${formatNumber(row.calls)} tokens=${formatNumber(row.tokens)} nonzero=${row.nonzero} errors=${row.errors} max=${formatNumber(row.maxTokens)}`,
  );

  printSection("Top Commands By Tokens");
  printRows(report.sessions.commands, (row) =>
    `tokens=${formatNumber(row.tokens)} calls=${formatNumber(row.calls)} nonzero=${row.nonzero} :: ${row.command}`,
  );

  printSection("Commands With Nonzero Exits");
  printRows(report.sessions.failingCommands, (row) =>
    `nonzero=${row.nonzero} exits=${JSON.stringify(row.exits)} tokens=${formatNumber(row.tokens)} :: ${row.command}`,
  );

  printSection("Commands With Tool Errors");
  printRows(report.sessions.errorCommands, (row) =>
    `errors=${row.errors} tokens=${formatNumber(row.tokens)} :: ${row.command}`,
  );

  printSection("Hook Summary");
  process.stdout.write(
    `rewriteRate=${formatPercent(report.hookHistory.rewriteRate)} avgRatio=${formatPercent(report.hookHistory.avgRatio)} saved=${formatNumber(report.hookHistory.savedChars)} raw=${formatNumber(report.hookHistory.rawChars)}\n`,
  );

  printSection("Hook Skipped Reasons");
  printRows(report.hookHistory.skipped, (row) => `${row.reason} count=${row.count}`);

  printSection("Hook Reducers");
  printRows(report.hookHistory.reducers, (row) => `${row.reducer} count=${row.count}`);

  printSection("Hook Weak Reducers");
  printRows(report.hookHistory.weakReducers, (row) =>
    `${row.reducer} ratio=${formatPercent(row.ratio)} raw=${formatNumber(row.rawChars)} :: ${row.command}`,
  );

  printSection("Hook No-Gain Examples");
  printRows(report.hookHistory.noGainExamples, (row) =>
    `${row.reducer} ratio=${formatPercent(row.ratio)} saved=${row.savedChars} :: ${row.command}`,
  );

  printSection("Hook Heads By Saved Chars");
  printRows(report.hookHistory.commandHeads, (row) =>
    `${row.head} count=${row.count} rewriteRate=${formatPercent(row.rewriteRate)} saved=${formatNumber(row.savedChars)} reducers=${row.reducers.map((item) => `${item.reducer}:${item.count}`).join(",")}`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = {
    generatedAt: new Date().toISOString(),
    codexHome: options.codexHome,
    sessions: await analyzeSessions(options.codexHome, options.sessionLimit, options.top),
    hookHistory: await analyzeHookHistory(options.codexHome, options.top),
  };

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  emitText(report);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
