import { doctorClaudeCodeHook } from "../claude-code/index.js";
import { doctorCodexHook } from "../codex/index.js";
import { doctorCursorHook } from "../cursor/index.js";
import { doctorPiExtension } from "../pi/index.js";

import type { ClaudeCodeDoctorReport, ClaudeCodeHookCommandOptions } from "../claude-code/index.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "../codex/index.js";
import type { CursorDoctorReport } from "../cursor/index.js";
import type { PiDoctorReport } from "../pi/index.js";

type HookHealthStatus = "ok" | "warn" | "broken" | "disabled";

export type HookIntegrationDoctorReport = {
  codex: CodexDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
  cursor: CursorDoctorReport;
  pi: PiDoctorReport;
};

export type HookDoctorReport = {
  status: HookHealthStatus;
  integrations: HookIntegrationDoctorReport;
};

export type HookDoctorCommandOptions = CodexHookCommandOptions & ClaudeCodeHookCommandOptions;

function mergeStatus(left: HookHealthStatus, right: HookHealthStatus): HookHealthStatus {
  if (left === "broken" || right === "broken") {
    return "broken";
  }
  if (left === "warn" || right === "warn") {
    return "warn";
  }
  if (left === "ok" || right === "ok") {
    return "ok";
  }
  if (left === "disabled" || right === "disabled") {
    return "disabled";
  }
  return "ok";
}

export async function doctorInstalledHooks(options: HookDoctorCommandOptions = {}): Promise<HookDoctorReport> {
  const codex = await doctorCodexHook(undefined, options);
  const hookCommandOptions = {
    ...(typeof options.local === "boolean" ? { local: options.local } : {}),
    ...(typeof options.binaryPath === "string" ? { binaryPath: options.binaryPath } : {}),
    ...(typeof options.nodePath === "string" ? { nodePath: options.nodePath } : {}),
  };
  const claudeCode = await doctorClaudeCodeHook(undefined, hookCommandOptions);
  const cursor = await doctorCursorHook(undefined, hookCommandOptions);
  const pi = await doctorPiExtension();

  return {
    status: mergeStatus(mergeStatus(mergeStatus(codex.status, claudeCode.status), cursor.status), pi.status),
    integrations: {
      codex,
      "claude-code": claudeCode,
      cursor,
      pi,
    },
  };
}
