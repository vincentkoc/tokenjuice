import { doctorClaudeCodeHook } from "./claude-code.js";
import { doctorCodexHook } from "./codex.js";

import type { ClaudeCodeDoctorReport } from "./claude-code.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "./codex.js";

export type HookIntegrationDoctorReport = {
  codex: CodexDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
};

export type HookDoctorReport = {
  status: "ok" | "warn" | "broken";
  integrations: HookIntegrationDoctorReport;
};

function mergeStatus(left: "ok" | "warn" | "broken", right: "ok" | "warn" | "broken"): "ok" | "warn" | "broken" {
  if (left === "broken" || right === "broken") {
    return "broken";
  }
  if (left === "warn" || right === "warn") {
    return "warn";
  }
  return "ok";
}

export async function doctorInstalledHooks(codexOptions: CodexHookCommandOptions = {}): Promise<HookDoctorReport> {
  const codex = await doctorCodexHook(undefined, codexOptions);
  const claudeCode = await doctorClaudeCodeHook();

  return {
    status: mergeStatus(codex.status, claudeCode.status),
    integrations: {
      codex,
      "claude-code": claudeCode,
    },
  };
}
