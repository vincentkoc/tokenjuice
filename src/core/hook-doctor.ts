import { doctorClaudeCodeHook } from "./claude-code.js";
import { doctorCodexHook } from "./codex.js";
import { doctorCursorHook } from "./cursor.js";
import { doctorPiExtension } from "./pi.js";

import type { ClaudeCodeDoctorReport } from "./claude-code.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "./codex.js";
import type { CursorDoctorReport } from "./cursor.js";
import type { PiDoctorReport } from "./pi.js";

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
