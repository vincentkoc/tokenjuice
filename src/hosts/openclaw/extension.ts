import { compactBashResult, getOutputAwareInspectionSkipReason } from "../../core/integrations/compact-bash-result.js";
import { readOpenClawShellCommand } from "../../core/integrations/openclaw-command.js";
import {
  buildCompactionNotice,
  buildTokenjuiceDetails,
  extractTextContent,
  mergeDetails,
} from "../shared/tool-result.js";
import { formatErrorMessage } from "../pi/extension/utils.js";

type OpenClawPi = {
  on(event: string, handler: (event: unknown, ctx: OpenClawPiContext) => unknown): void;
};

type OpenClawPiContext = {
  cwd: string;
};

type OpenClawToolResultEvent = {
  toolName?: string;
  input?: unknown;
  content?: unknown;
  details?: unknown;
  isError?: boolean;
};

type OpenClawExecDetails =
  | {
      status?: "completed" | "failed";
      exitCode?: number | null;
      aggregated?: string;
      cwd?: string;
    }
  | Record<string, unknown>;

const DEFAULT_MAX_INLINE_CHARS = 1200;
const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExecLikeToolName(toolName: string | undefined): boolean {
  return (
    toolName === "exec"
    || toolName === "bash"
    || toolName === "gateway_exec"
    || toolName === "node_exec"
  );
}

function readCwd(input: unknown, details: unknown, fallback: string): string {
  if (isRecord(input) && typeof input.workdir === "string" && input.workdir.trim()) {
    return input.workdir;
  }
  if (isRecord(details) && typeof details.cwd === "string" && details.cwd.trim()) {
    return details.cwd;
  }
  return fallback;
}

function readAggregatedText(details: unknown, content: unknown): string {
  if (isRecord(details) && typeof details.aggregated === "string") {
    return details.aggregated;
  }
  return extractTextContent(content);
}

function readExitCode(details: OpenClawExecDetails): number | undefined {
  return typeof details.exitCode === "number" && Number.isInteger(details.exitCode)
    ? details.exitCode
    : undefined;
}

function isCompletedExecDetails(details: unknown): details is OpenClawExecDetails {
  if (!isRecord(details)) {
    return false;
  }
  return details.status === "completed" || details.status === "failed";
}

export function createTokenjuiceOpenClawEmbeddedExtension() {
  return function tokenjuiceOpenClawExtension(pi: OpenClawPi): void {
    pi.on("tool_result", async (rawEvent, ctx) => {
      const event = rawEvent as OpenClawToolResultEvent;
      if (!isExecLikeToolName(event.toolName)) {
        return undefined;
      }
      if (!isCompletedExecDetails(event.details)) {
        return undefined;
      }

      const exitCode = readExitCode(event.details);
      if (exitCode === undefined && (event.isError || event.details.status === "failed")) {
        return undefined;
      }
      const command = readOpenClawShellCommand(event.input);
      if (!command) {
        return undefined;
      }
      const outputText = readAggregatedText(event.details, event.content);
      if (!outputText.trim()) {
        return undefined;
      }
      const executionInput = {
        toolName: "exec",
        command,
        combinedText: outputText,
      };
      if (getOutputAwareInspectionSkipReason("allow-safe-inventory", executionInput)) {
        return undefined;
      }

      try {
        const outcome = await compactBashResult({
          source: "openclaw",
          command,
          cwd: readCwd(event.input, event.details, ctx.cwd),
          visibleText: outputText,
          ...(exitCode !== undefined ? { exitCode } : {}),
          renderDeliveredText: (result) => result.inlineText + "\n\n[" + buildCompactionNotice(result) + "]",
          maxInlineChars: DEFAULT_MAX_INLINE_CHARS,
          inspectionPolicy: "allow-safe-inventory",
          minSavedCharsAny: 8,
          genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
          genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
          skipGenericFallbackForCompoundCommands: true,
          metadata: {
            source: "openclaw-tool-result",
          },
        });

        if (outcome.action === "keep" || !outcome.delivery) {
          return undefined;
        }

        const { text: deliveredText, stats } = outcome.delivery;
        return {
          content: [
            {
              type: "text",
              text: deliveredText,
            },
          ],
          details: {
            ...mergeDetails(event.details, buildTokenjuiceDetails({ ...outcome.result, stats })),
            // Structured consumers use aggregated instead of the content projection.
            ...(typeof event.details.aggregated === "string" ? { aggregated: deliveredText } : {}),
          },
        };
      } catch (error) {
        throw new Error(`tokenjuice failed to compact OpenClaw exec output: ${formatErrorMessage(error)}`);
      }
    });
  };
}
