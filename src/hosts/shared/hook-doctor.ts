import { doctorClaudeCodeHook } from "../claude-code/index.js";
import { doctorCodexHook } from "../codex/index.js";
import { doctorCursorHook } from "../cursor/index.js";
import { doctorPiExtension } from "../pi/index.js";

import type { ClaudeCodeDoctorReport } from "../claude-code/index.js";
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

export async function doctorInstalledHooks(codexOptions: CodexHookCommandOptions = {}): Promise<HookDoctorReport> {
  const codex = await doctorCodexHook(undefined, codexOptions);
  const claudeCode = await doctorClaudeCodeHook();
  const cursor = await doctorCursorHook();
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
