#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { stdin as inputStdin } from "node:process";

import { getArtifact, listArtifactMetadata, listArtifacts } from "../core/artifacts.js";
import { discoverCandidates, doctorArtifacts } from "../core/analysis.js";
import { reduceExecution } from "../core/reduce.js";
import { verifyRules } from "../core/rules.js";
import { runWrappedCommand } from "../core/wrap.js";

type Format = "text" | "json";

type ParsedArgs = {
  command: string | undefined;
  format: Format;
  classifier: string | undefined;
  store: boolean;
  tee: boolean;
  storeDir: string | undefined;
  maxInlineChars: number | undefined;
  positionals: string[];
  passthrough: string[];
};

function printUsage(): void {
  process.stderr.write(
    [
      "usage:",
      "  tokenjuice reduce [file] [--format text|json] [--classifier <id>] [--store]",
      "  tokenjuice wrap -- <command> [args...] [--tee] [--store]",
      "  tokenjuice ls",
      "  tokenjuice cat <artifact-id>",
      "  tokenjuice verify",
      "  tokenjuice discover",
      "  tokenjuice doctor",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const positionals: string[] = [];
  const passthrough: string[] = [];
  let format: Format = "text";
  let classifier: string | undefined;
  let store = false;
  let tee = false;
  let storeDir: string | undefined;
  let maxInlineChars: number | undefined;

  let index = 1;
  while (index < argv.length) {
    const current = argv[index]!;
    if (current === "--") {
      passthrough.push(...argv.slice(index + 1));
      break;
    }

    if (!current.startsWith("--")) {
      positionals.push(current);
      index += 1;
      continue;
    }

    const next = argv[index + 1];
    switch (current) {
      case "--format":
        if (next !== "text" && next !== "json") {
          throw new Error("--format must be text or json");
        }
        format = next;
        index += 2;
        break;
      case "--classifier":
        if (!next) {
          throw new Error("--classifier requires a value");
        }
        classifier = next;
        index += 2;
        break;
      case "--store":
        store = true;
        index += 1;
        break;
      case "--tee":
        tee = true;
        index += 1;
        break;
      case "--store-dir":
        if (!next) {
          throw new Error("--store-dir requires a value");
        }
        storeDir = next;
        index += 2;
        break;
      case "--max-inline-chars":
        if (!next || Number.isNaN(Number(next))) {
          throw new Error("--max-inline-chars requires a number");
        }
        maxInlineChars = Number(next);
        index += 2;
        break;
      default:
        throw new Error(`unknown flag: ${current}`);
    }
  }

  return {
    command,
    format,
    classifier,
    store,
    tee,
    storeDir,
    maxInlineChars,
    positionals,
    passthrough,
  };
}

async function readStdin(): Promise<string> {
  if (inputStdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of inputStdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function emit(format: Format, value: unknown, text: string): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${text}\n`);
}

async function runReduce(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const rawText = file ? await readFile(file, "utf8") : await readStdin();
  const result = await reduceExecution(
    {
      toolName: "exec",
      command: file ? `reduce:${file}` : "stdin",
      combinedText: rawText,
      exitCode: 0,
    },
    {
      ...(args.classifier ? { classifier: args.classifier } : {}),
      ...(args.store ? { store: true } : {}),
      ...(args.storeDir ? { storeDir: args.storeDir } : {}),
      ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
    },
  );
  emit(args.format, result, result.inlineText);
  return 0;
}

async function runWrap(args: ParsedArgs): Promise<number> {
  const wrapped = await runWrappedCommand(args.passthrough, {
    tee: args.tee,
    ...(args.store ? { store: true } : {}),
    ...(args.storeDir ? { storeDir: args.storeDir } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
  });
  emit(args.format, wrapped, wrapped.result.inlineText);
  return wrapped.exitCode;
}

async function runList(args: ParsedArgs): Promise<number> {
  const refs = await listArtifacts(args.storeDir);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(refs, null, 2)}\n`);
    return 0;
  }

  for (const ref of refs) {
    process.stdout.write(`${ref.id}\t${ref.path}\n`);
  }
  return 0;
}

async function runCat(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0];
  if (!id) {
    throw new Error("cat requires an artifact id");
  }
  const artifact = await getArtifact(id, args.storeDir);
  if (!artifact) {
    throw new Error(`artifact not found: ${id}`);
  }

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(artifact.rawText);
  if (!artifact.rawText.endsWith("\n")) {
    process.stdout.write("\n");
  }
  return 0;
}

async function runVerify(args: ParsedArgs): Promise<number> {
  const results = await verifyRules();
  const failed = results.filter((result) => !result.ok);

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return failed.length === 0 ? 0 : 1;
  }

  if (failed.length === 0) {
    process.stdout.write(`ok: ${results.length} rules validated\n`);
    return 0;
  }

  for (const result of failed) {
    process.stderr.write(`${result.source}:${result.id}\n`);
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }
  return 1;
}

function formatRatio(ratio: number | null): string {
  if (ratio === null) {
    return "n/a";
  }
  return `${Math.round(ratio * 100)}%`;
}

async function runDiscover(args: ParsedArgs): Promise<number> {
  const metadata = await listArtifactMetadata(args.storeDir);
  const candidates = discoverCandidates(metadata);

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
    return 0;
  }

  if (candidates.length === 0) {
    process.stdout.write("no discover candidates found\n");
    return 0;
  }

  for (const candidate of candidates) {
    process.stdout.write(
      [
        candidate.kind,
        candidate.signature,
        `count=${candidate.count}`,
        `raw=${candidate.totalRawChars}`,
        `avgRatio=${formatRatio(candidate.avgRatio)}`,
        `sample="${candidate.sampleCommand}"`,
        candidate.matchedReducer ? `reducer=${candidate.matchedReducer}` : null,
      ].filter(Boolean).join(" "),
    );
    process.stdout.write("\n");
  }
  return 0;
}

async function runDoctor(args: ParsedArgs): Promise<number> {
  const metadata = await listArtifactMetadata(args.storeDir);
  const report = doctorArtifacts(metadata);

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`artifacts: ${report.totals.artifacts}\n`);
  process.stdout.write(`generic artifacts: ${report.totals.genericArtifacts}\n`);
  process.stdout.write(`weak artifacts: ${report.totals.weakArtifacts}\n`);
  process.stdout.write(`avg ratio: ${formatRatio(report.totals.avgRatio)}\n`);

  if (report.topMissingCommands.length > 0) {
    process.stdout.write("missing-rule candidates:\n");
    for (const candidate of report.topMissingCommands.slice(0, 5)) {
      process.stdout.write(`- ${candidate.signature} count=${candidate.count} raw=${candidate.totalRawChars}\n`);
    }
  }

  if (report.topWeakReducers.length > 0) {
    process.stdout.write("weak-rule candidates:\n");
    for (const candidate of report.topWeakReducers.slice(0, 5)) {
      process.stdout.write(
        `- ${candidate.signature} reducer=${candidate.matchedReducer ?? "n/a"} count=${candidate.count} avgRatio=${formatRatio(candidate.avgRatio)}\n`,
      );
    }
  }

  if (report.topReducers.length > 0) {
    process.stdout.write("top reducers:\n");
    for (const reducer of report.topReducers.slice(0, 5)) {
      process.stdout.write(`- ${reducer.reducer} count=${reducer.count}\n`);
    }
  }

  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "reduce":
      return await runReduce(args);
    case "wrap":
      return await runWrap(args);
    case "ls":
      return await runList(args);
    case "cat":
      return await runCat(args);
    case "verify":
      return await runVerify(args);
    case "discover":
      return await runDiscover(args);
    case "doctor":
      return await runDoctor(args);
    default:
      printUsage();
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
