import { readFile, stat } from "node:fs/promises";

import { compactBashResult } from "../../../core/integrations/compact-bash-result.js";
import {
  buildCompactionNotice,
  buildTokenjuiceDetails,
} from "../../shared/tool-result.js";
import { formatErrorMessage } from "../../pi/extension/utils.js";

export type OpenCodeExtensionRuntimeConfig = Record<string, never>;

type OpenCodeToolInput = {
  tool: string;
  sessionID?: string;
  callID?: string;
  args?: unknown;
};

type OpenCodeToolOutput = {
  title?: string;
  output: string;
  metadata?: unknown;
};

type OpenCodeHooks = {
  "tool.execute.after": (input: OpenCodeToolInput, output: OpenCodeToolOutput) => Promise<void>;
};

const DEFAULT_MAX_INLINE_CHARS = 1200;
const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;
const MAX_TRUSTED_FULL_OUTPUT_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCommand(args: unknown): string {
  return isRecord(args) && typeof args.command === "string" ? args.command : "";
}

function readCwd(args: unknown): string | undefined {
  if (isRecord(args) && typeof args.workdir === "string" && args.workdir.trim()) {
    return args.workdir;
  }
  return undefined;
}

function extractFullOutputPath(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }
  if (metadata.truncated !== true) {
    return undefined;
  }
  if (typeof metadata.outputPath === "string" && metadata.outputPath.trim()) {
    return metadata.outputPath;
  }
  return undefined;
}

async function loadFullOutputText(fullOutputPath: string): Promise<string | null> {
  let details;
  try {
    details = await stat(fullOutputPath);
  } catch (error) {
    throw new Error(
      `tokenjuice failed to stat bash full output file ${fullOutputPath}: ${formatErrorMessage(error)}`,
    );
  }
  if (details.size > MAX_TRUSTED_FULL_OUTPUT_BYTES) {
    return null;
  }
  try {
    return await readFile(fullOutputPath, "utf8");
  } catch (error) {
    throw new Error(
      `tokenjuice failed to read bash full output file ${fullOutputPath}: ${formatErrorMessage(error)}`,
    );
  }
}

export function createTokenjuiceOpenCodeExtension(_config: OpenCodeExtensionRuntimeConfig = {}) {
  return async function tokenjuiceOpenCodeExtension(_context?: unknown): Promise<OpenCodeHooks> {
    return {
      "tool.execute.after": async (input, output) => {
        if (input.tool !== "bash") {
          return;
        }

        const command = readCommand(input.args);
        if (!command) {
          return;
        }

        const outputText = typeof output.output === "string" ? output.output : "";
        if (!outputText.trim()) {
          return;
        }

        const cwd = readCwd(input.args);
        const fullOutputPath = extractFullOutputPath(output.metadata);
        const trustedFullOutputText = fullOutputPath
          ? await loadFullOutputText(fullOutputPath)
          : undefined;
        if (fullOutputPath && trustedFullOutputText === null) {
          return;
        }

        let outcome;
        try {
          outcome = await compactBashResult({
            source: "opencode",
            command,
            ...(cwd ? { cwd } : {}),
            visibleText: outputText,
            ...(typeof trustedFullOutputText === "string"
              ? { trustedFullText: trustedFullOutputText }
              : {}),
            maxInlineChars: DEFAULT_MAX_INLINE_CHARS,
            inspectionPolicy: "allow-safe-inventory",
            minSavedCharsAny: 8,
            genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
            genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
            skipGenericFallbackForCompoundCommands: true,
            metadata: { source: "opencode-tool-result" },
          });
        } catch (error) {
          throw new Error(`tokenjuice failed to compact OpenCode bash output: ${formatErrorMessage(error)}`);
        }

        if (outcome.action === "keep") {
          return;
        }

        output.output = `${outcome.result.inlineText}\n\n[${buildCompactionNotice(outcome.result, fullOutputPath)}]`;

        const tokenjuiceDetails = buildTokenjuiceDetails(outcome.result);
        if (isRecord(output.metadata)) {
          (output.metadata as Record<string, unknown>).tokenjuice = tokenjuiceDetails;
        } else {
          (output as { metadata: unknown }).metadata = { tokenjuice: tokenjuiceDetails };
        }
      },
    };
  };
}
