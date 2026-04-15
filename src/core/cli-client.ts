import { spawn } from "node:child_process";

import type { CompactResult, ReduceJsonCliOptions, ReduceJsonRequest } from "../types.js";

const DEFAULT_REDUCE_JSON_COMMAND = ["tokenjuice", "reduce-json"];
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function resolveCommand(command?: string[]): string[] {
  const resolved = command ?? DEFAULT_REDUCE_JSON_COMMAND;
  if (resolved.length === 0 || !resolved[0]) {
    throw new Error("reduce-json client requires a command");
  }
  return resolved;
}

function buildExitError(command: string[], code: number | null, stderr: string): Error {
  const suffix = stderr.trim() ? `\n${stderr.trim()}` : "";
  return new Error(`reduce-json command failed (${command.join(" ")}) with exit ${code ?? "unknown"}${suffix}`);
}

function buildParseError(stdout: string): Error {
  const preview = stdout.trim().slice(0, 400);
  return new Error(`reduce-json command returned invalid JSON${preview ? `\n${preview}` : ""}`);
}

export async function runReduceJsonCli(
  request: ReduceJsonRequest,
  options: ReduceJsonCliOptions = {},
): Promise<CompactResult> {
  const command = resolveCommand(options.command);
  const maxOutputBytes = typeof options.maxOutputBytes === "number" && options.maxOutputBytes > 0
    ? options.maxOutputBytes
    : DEFAULT_MAX_OUTPUT_BYTES;

  return await new Promise<CompactResult>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(`reduce-json command timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > maxOutputBytes) {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`reduce-json command exceeded max output size of ${maxOutputBytes} bytes`));
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length + chunk.length > maxOutputBytes) {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`reduce-json command exceeded max output size of ${maxOutputBytes} bytes`));
        return;
      }
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    child.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (settled) {
        return;
      }
      settled = true;

      if (code !== 0) {
        reject(buildExitError(command, code, stderr));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as CompactResult);
      } catch {
        reject(buildParseError(stdout));
      }
    });

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}
