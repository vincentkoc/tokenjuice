import { doctorAiderConvention } from "../aider/index.js";
import { doctorClaudeCodeHook } from "../claude-code/index.js";
import { doctorClineHook } from "../cline/index.js";
import { doctorCodeBuddyHook } from "../codebuddy/index.js";
import { doctorContinueRule } from "../continue/index.js";
import { doctorCodexHook } from "../codex/index.js";
import { doctorCopilotCliHook } from "../copilot-cli/index.js";
import { doctorCursorHook } from "../cursor/index.js";
import { doctorGeminiCliHook } from "../gemini-cli/index.js";
import { doctorOpenHandsHook } from "../openhands/index.js";
import { doctorPiExtension } from "../pi/index.js";
import { doctorVscodeCopilotHook } from "../vscode-copilot/index.js";

import type { AiderDoctorReport } from "../aider/index.js";
import type { ClaudeCodeDoctorReport, ClaudeCodeHookCommandOptions } from "../claude-code/index.js";
import type { ClineDoctorReport } from "../cline/index.js";
import type { CodeBuddyDoctorReport, CodeBuddyHookCommandOptions } from "../codebuddy/index.js";
import type { ContinueDoctorReport } from "../continue/index.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "../codex/index.js";
import type { CopilotCliDoctorReport } from "../copilot-cli/index.js";
import type { CursorDoctorReport } from "../cursor/index.js";
import type { GeminiCliDoctorReport } from "../gemini-cli/index.js";
import type { OpenHandsDoctorReport } from "../openhands/index.js";
import type { PiDoctorReport } from "../pi/index.js";
import type { VscodeCopilotDoctorReport } from "../vscode-copilot/index.js";

type HookHealthStatus = "ok" | "warn" | "broken" | "disabled";

export type HookIntegrationDoctorReport = {
  aider: AiderDoctorReport;
  codex: CodexDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
  cline: ClineDoctorReport;
  codebuddy: CodeBuddyDoctorReport;
  continue: ContinueDoctorReport;
  cursor: CursorDoctorReport;
  "gemini-cli": GeminiCliDoctorReport;
  openhands: OpenHandsDoctorReport;
  pi: PiDoctorReport;
  "vscode-copilot": VscodeCopilotDoctorReport;
  "copilot-cli": CopilotCliDoctorReport;
};

export type HookDoctorReport = {
  status: HookHealthStatus;
  integrations: HookIntegrationDoctorReport;
};

export type HookDoctorCommandOptions = CodexHookCommandOptions & ClaudeCodeHookCommandOptions & CodeBuddyHookCommandOptions;

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
  const aider = await doctorAiderConvention();
  const codex = await doctorCodexHook(undefined, options);
  const hookCommandOptions = {
    ...(typeof options.local === "boolean" ? { local: options.local } : {}),
    ...(typeof options.binaryPath === "string" ? { binaryPath: options.binaryPath } : {}),
    ...(typeof options.nodePath === "string" ? { nodePath: options.nodePath } : {}),
  };
  const claudeCode = await doctorClaudeCodeHook(undefined, hookCommandOptions);
  const cline = await doctorClineHook(undefined, hookCommandOptions);
  const codebuddy = await doctorCodeBuddyHook(undefined, hookCommandOptions);
  const continueRule = await doctorContinueRule();
  const cursor = await doctorCursorHook(undefined, hookCommandOptions);
  const geminiCli = await doctorGeminiCliHook(undefined, hookCommandOptions);
  const openhands = await doctorOpenHandsHook(undefined, hookCommandOptions);
  const pi = await doctorPiExtension();
  const vscodeCopilot = await doctorVscodeCopilotHook(undefined, hookCommandOptions);
  const copilotCli = await doctorCopilotCliHook(undefined, hookCommandOptions);

  return {
    status: mergeStatus(
      mergeStatus(
        mergeStatus(
          mergeStatus(
            mergeStatus(
              mergeStatus(
                mergeStatus(mergeStatus(mergeStatus(aider.status, codex.status), claudeCode.status), cline.status),
                codebuddy.status,
              ),
              continueRule.status,
            ),
            mergeStatus(cursor.status, geminiCli.status),
          ),
          mergeStatus(openhands.status, pi.status),
        ),
        vscodeCopilot.status,
      ),
      copilotCli.status,
    ),
    integrations: {
      aider,
      codex,
      "claude-code": claudeCode,
      cline,
      codebuddy,
      continue: continueRule,
      cursor,
      "gemini-cli": geminiCli,
      openhands,
      pi,
      "vscode-copilot": vscodeCopilot,
      "copilot-cli": copilotCli,
    },
  };
}
