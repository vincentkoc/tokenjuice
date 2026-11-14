import { spawn } from "node:child_process";

import { reduceExecution } from "./reduce.js";
import { storeArtifact, tryStoreArtifactMetadata } from "./artifacts.js";
import { NO_COMPACTION_METADATA } from "./compaction-metadata.js";
import { countTextChars, stripAnsi } from "./text.js";
import { decorateWrapInlineText } from "./wrap-format.js";
import { StreamedTextCounter } from "./streamed-text-counter.js";

import type { CompactResult, StoredArtifactRef, ToolExecutionInput, WrapOptions, WrapResult } from "../types.js";

const DEFAULT_MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const CAPTURE_TRUNCATED_SUFFIX = "\n[tokenjuice: output truncated]\n";

type CapturedStream = {
  text: string;
  bytes: number;
  truncated: boolean;
};

function appendCapturedChunk(
  current: CapturedStream,
  chunk: Buffer,
  limitBytes: number,
): CapturedStream {
  if (current.truncated || limitBytes <= 0) {
    return current.truncated
      ? current
      : {
          text: CAPTURE_TRUNCATED_SUFFIX,
          bytes: 0,
          truncated: true,
        };
  }

  const remaining = limitBytes - current.bytes;
  if (remaining <= 0) {
    return {
      text: `${current.text}${CAPTURE_TRUNCATED_SUFFIX}`,
      bytes: current.bytes,
      truncated: true,
    };
  }

  if (chunk.length <= remaining) {
    return {
      text: `${current.text}${chunk.toString("utf8")}`,
      bytes: current.bytes + chunk.length,
      truncated: false,
    };
  }

  return {
    text: `${current.text}${chunk.subarray(0, remaining).toString("utf8")}${CAPTURE_TRUNCATED_SUFFIX}`,
    bytes: limitBytes,
    truncated: true,
  };
}

export async function runWrappedCommand(argv: string[], opts: WrapOptions = {}): Promise<WrapResult> {
  if (argv.length === 0) {
    throw new Error("wrap requires a command after --");
  }

  return await new Promise<WrapResult>((resolve, reject) => {
    const maxCaptureBytes = typeof opts.maxCaptureBytes === "number"
      ? opts.maxCaptureBytes
      : DEFAULT_MAX_CAPTURE_BYTES;
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: opts.cwd,
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout: CapturedStream = { text: "", bytes: 0, truncated: false };
    let stderr: CapturedStream = { text: "", bytes: 0, truncated: false };
    let combined: CapturedStream = { text: "", bytes: 0, truncated: false };
    const streamedStdout = new StreamedTextCounter();
    const streamedStderr = new StreamedTextCounter();

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = appendCapturedChunk(stdout, chunk, maxCaptureBytes);
      combined = appendCapturedChunk(combined, chunk, maxCaptureBytes);
      if (opts.tee) {
        streamedStdout.write(text);
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = appendCapturedChunk(stderr, chunk, maxCaptureBytes);
      combined = appendCapturedChunk(combined, chunk, maxCaptureBytes);
      if (opts.tee) {
        streamedStderr.write(text);
        process.stderr.write(text);
      }
    });

    child.on("error", reject);
    child.on("close", async (code) => {
      try {
        const input: ToolExecutionInput = {
          toolName: "exec",
          command: argv.join(" "),
          argv,
          stdout: stdout.text,
          stderr: stderr.text,
          combinedText: combined.text,
          exitCode: code ?? 1,
          metadata: {
            ...(opts.source ? { source: opts.source } : {}),
            tokenjuiceCaptureTruncated: combined.truncated,
          },
        };
        const raw = opts.raw === true || (opts.keepFailures === true && code !== 0);
        const reduced = await reduceExecution(
          input,
          {
            raw,
            noOmit: opts.noOmit ?? false,
            trace: opts.trace ?? false,
            recordStats: false,
            ...(typeof opts.maxInlineChars === "number" ? { maxInlineChars: opts.maxInlineChars } : {}),
          },
        );

        const finalize = (ref?: StoredArtifactRef): CompactResult => {
          const result = { ...reduced, ...(combined.truncated ? { captureTruncated: true } : {}), ...(ref ? { rawRef: ref } : {}) };
          if (!opts.includeCompactionNotice) return result;
          const decorated = decorateWrapInlineText(result, raw);
          const candidate = raw || (stderr.text.length === 0 && decorated === stdout.text)
            ? decorated
            : `${decorated}\n`;
          const keepRaw = result.compaction?.authoritative
            && countTextChars(stripAnsi(candidate)) >= result.stats.rawChars;
          const inlineText = keepRaw ? combined.text : candidate;
          const failurePassthrough = opts.keepFailures && code !== 0;
          const inlineChars = failurePassthrough
            ? opts.tee ? 0 : countTextChars(stripAnsi(stdout.text)) + countTextChars(stripAnsi(stderr.text))
            : countTextChars(stripAnsi(inlineText));
          const reducedChars = inlineChars + streamedStdout.count + streamedStderr.count;
          return {
            ...result,
            inlineText,
            ...(keepRaw ? { compaction: NO_COMPACTION_METADATA } : {}),
            stats: {
              rawChars: result.stats.rawChars,
              reducedChars,
              ratio: result.stats.rawChars === 0 ? 1 : reducedChars / result.stats.rawChars,
            },
          };
        };
        let result = finalize();
        if (opts.store) {
          // Allocate the recovery ID before measuring the emitted payload, but
          // persist only its final statistics in both the sidecar and ledger.
          const ref = await storeArtifact(
            { input, rawText: combined.text, classification: reduced.classification, ...(opts.recordStats !== undefined ? { recordStats: opts.recordStats } : {}) },
            opts.storeDir,
            (rawRef) => {
              result = finalize(rawRef);
              return result.stats;
            },
          );
          result = { ...result, rawRef: ref };
        } else if (opts.recordStats) {
          await tryStoreArtifactMetadata(
            { input, rawText: combined.text, classification: result.classification, stats: result.stats },
            opts.storeDir,
          );
        }

        resolve({
          result,
          exitCode: code ?? 1,
          stdout: stdout.text,
          stderr: stderr.text,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
