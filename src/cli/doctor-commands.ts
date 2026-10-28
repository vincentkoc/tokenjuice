// Per-target handlers for `tokenjuice doctor <target>` (hosts plus `doctor hooks`).
// Each handler is keyed by the target name and its aliases in doctorCommands.

import { doctorAdalInstructions } from "../hosts/adal/index.js";
import { doctorAetherPrompt } from "../hosts/aether/index.js";
import { doctorAictlInstructions } from "../hosts/aictl/index.js";
import { doctorAiMemoryProtocolMemory } from "../hosts/ai-memory-protocol/index.js";
import { doctorAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { doctorAgentInitInstructions } from "../hosts/agentinit/index.js";
import { doctorAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { doctorAgentloomRule } from "../hosts/agentloom/index.js";
import { doctorAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { doctorAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { doctorAgentsGeRule } from "../hosts/agentsge/index.js";
import { doctorAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { doctorAmazonQRule } from "../hosts/amazon-q/index.js";
import { doctorAmpInstructions } from "../hosts/amp/index.js";
import { doctorAiderConvention } from "../hosts/aider/index.js";
import { doctorAntigravityRule } from "../hosts/antigravity/index.js";
import { doctorAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { doctorAugmentRule } from "../hosts/augment/index.js";
import { doctorAvanteInstructions } from "../hosts/avante/index.js";
import { doctorBazSkill } from "../hosts/baz/index.js";
import { doctorBitoGuidelines } from "../hosts/bito/index.js";
import { doctorBlackboxSkill } from "../hosts/blackbox/index.js";
import { doctorBlocksSkill } from "../hosts/blocks/index.js";
import { doctorClawdbotSkill } from "../hosts/clawdbot/index.js";
import { doctorBobInstructions } from "../hosts/bob/index.js";
import { doctorBuilderRule } from "../hosts/builder/index.js";
import { doctorCharlieInstructions } from "../hosts/charlie/index.js";
import { doctorClaudeCodeHook } from "../hosts/claude-code/index.js";
import { doctorClineHook } from "../hosts/cline/index.js";
import { doctorCodeAntInstructions } from "../hosts/codeant/index.js";
import { doctorCodebuffInstructions } from "../hosts/codebuff/index.js";
import { doctorCodegenInstructions } from "../hosts/codegen/index.js";
import { doctorCoderAgentsSkill } from "../hosts/coder-agents/index.js";
import { doctorCodeRabbitConfig } from "../hosts/coderabbit/index.js";
import { doctorCodeBuddyHook } from "../hosts/codebuddy/index.js";
import { doctorCommandCodeHook } from "../hosts/command-code/index.js";
import { doctorContinueRule } from "../hosts/continue/index.js";
import { doctorCodexHook } from "../hosts/codex/index.js";
import { doctorCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import { doctorCopilotCliHook, getCopilotCliInstructionsSnippet } from "../hosts/copilot-cli/index.js";
import { doctorCrushSkill } from "../hosts/crush/index.js";
import { doctorCursorHook } from "../hosts/cursor/index.js";
import { doctorDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { doctorDevinHook } from "../hosts/devin/index.js";
import { doctorDotAgentsRule } from "../hosts/dot-agents/index.js";
import { doctorDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { doctorDroidHook } from "../hosts/droid/index.js";
import { doctorEcaSkill } from "../hosts/eca/index.js";
import { doctorElyraSkill } from "../hosts/elyra/index.js";
import { doctorFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { doctorForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { doctorGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { doctorGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { doctorGooseHints } from "../hosts/goose/index.js";
import { doctorGreptileRule } from "../hosts/greptile/index.js";
import { doctorGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { doctorGrokBotRule } from "../hosts/grok-bot/index.js";
import { doctorGrokCliHook } from "../hosts/grok-cli/index.js";
import { doctorGptmeInstructions } from "../hosts/gptme/index.js";
import { doctorJean2Instructions } from "../hosts/jean2/index.js";
import { doctorJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { doctorJunieInstructions } from "../hosts/junie/index.js";
import { doctorJulesInstructions } from "../hosts/jules/index.js";
import { doctorLeanCtlInstructions } from "../hosts/leanctl/index.js";
import { doctorKimiHook } from "../hosts/kimi/index.js";
import { doctorKiroSteering } from "../hosts/kiro/index.js";
import { doctorKiloRule } from "../hosts/kilo/index.js";
import { doctorKnownsInstructions } from "../hosts/knowns/index.js";
import { doctorLocalCodePlugin } from "../hosts/localcode/index.js";
import { doctorMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { doctorMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { doctorSweAgentConfig } from "../hosts/swe-agent/index.js";
import { doctorStagewiseSkill } from "../hosts/stagewise/index.js";
import { doctorMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { doctorMuxHook } from "../hosts/mux/index.js";
import { doctorNovaKitInstructions } from "../hosts/novakit/index.js";
import { doctorOnaSkill } from "../hosts/ona/index.js";
import { doctorOpenCodeExtension } from "../hosts/opencode/index.js";
import { doctorOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { doctorOpenHandsHook } from "../hosts/openhands/index.js";
import { doctorOpenWebUITool } from "../hosts/openwebui/index.js";
import { doctorPiExtension } from "../hosts/pi/index.js";
import { doctorPiGoSkill } from "../hosts/pi-go/index.js";
import { doctorPlandexConvention } from "../hosts/plandex/index.js";
import { doctorQodoReviewConfig } from "../hosts/qodo/index.js";
import { doctorQoderInstructions } from "../hosts/qoder/index.js";
import { doctorQwenCodeHook } from "../hosts/qwen-code/index.js";
import { doctorReplitInstructions } from "../hosts/replit/index.js";
import { doctorRooInstructions } from "../hosts/roo/index.js";
import { doctorRovoInstructions } from "../hosts/rovo/index.js";
import { doctorRulerRule } from "../hosts/ruler/index.js";
import { doctorTabbySystemPrompt } from "../hosts/tabby/index.js";
import { doctorTabnineInstructions } from "../hosts/tabnine/index.js";
import { doctorTraeRule } from "../hosts/trae/index.js";
import { doctorUiPathInstructions } from "../hosts/uipath/index.js";
import { doctorVscodeCopilotHook, getVscodeCopilotInstructionsSnippet } from "../hosts/vscode-copilot/index.js";
import { doctorWarpInstructions } from "../hosts/warp/index.js";
import { doctorWindsurfRule } from "../hosts/windsurf/index.js";
import { doctorZedInstructions } from "../hosts/zed/index.js";
import { doctorZencoderRule } from "../hosts/zencoder/index.js";
import { doctorInstalledHooks } from "../hosts/shared/hook-doctor.js";
import { formatHookDoctorReport } from "./doctor-output.js";
import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

async function doctorHooksCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorInstalledHooks({ local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(formatHookDoctorReport(report));
  return report.status === "broken" ? 1 : 0;
}

async function doctorAdalCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAdalInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAetherCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAetherPrompt();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`prompt path: ${report.promptPath}\n`);
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAiderCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAiderConvention();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`convention path: ${report.conventionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAictlCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAictlInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAiMemoryProtocolCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAiMemoryProtocolMemory();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`memory path: ${report.memoryPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentLayerCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentLayerInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentinitCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentInitInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentlinkCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentlinkInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentloomCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentloomRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentsCliCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentsCliMemory();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`memory path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentsMdCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentsMdInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentsgeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentsGeRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAgentsmeshCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAgentsMeshRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAmazonQCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAmazonQRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAmpCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAmpInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAntigravityCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAntigravityRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAnywhereAgentsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAnywhereAgentsInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAugmentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAugmentRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorAvanteCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorAvanteInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBazCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBazSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBitoCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBitoGuidelines();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`guidelines path: ${report.guidelinesPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBlackboxCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBlackboxSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBlocksCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBlocksSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorClawdbotCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorClawdbotSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBobCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBobInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorBuilderCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorBuilderRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCharlieCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCharlieInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCodexCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodexHook(undefined, {
    local: args.local,
    ...(args.noOmit ? { noOmit: true } : {}),
  });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.featureFlag.enabled) {
    const source = report.featureFlag.key ? `[features].${report.featureFlag.key}` : "default-on";
    process.stdout.write(
      `feature flag: hooks enabled via ${source} (${report.featureFlag.configPath})\n`,
    );
  } else {
    const where = report.featureFlag.configExists
      ? `${report.featureFlag.configPath} (missing or disabled)`
      : `no ${report.featureFlag.configPath}`;
    process.stdout.write(`feature flag: hooks disabled — ${where}\n`);
    process.stdout.write(`   ${report.featureFlag.fixHint}\n`);
  }
  if (report.runtimeConfig.configExists) {
    process.stdout.write(
      `codex config: approval_policy=${report.runtimeConfig.approvalPolicy ?? "(default)"}, sandbox_mode=${report.runtimeConfig.sandboxMode ?? "(default)"}, approvals_reviewer=${report.runtimeConfig.approvalsReviewer ?? "(default)"}\n`,
    );
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorPiCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorPiExtension();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`extension path: ${report.extensionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorPiGoCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorPiGoSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorOpencodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorOpenCodeExtension();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`extension path: ${report.extensionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorPlandexCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorPlandexConvention();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`convention path: ${report.conventionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorQoderCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorQoderInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorReplitCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorReplitInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorQwenCodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorQwenCodeHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCommandCodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCommandCodeHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCrushCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCrushSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCursorCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCursorHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorDeepagentsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorDeepAgentsInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorDevinCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorDevinHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorDotAgentsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorDotAgentsRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorDockerAgentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorDockerAgentPrompt();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`prompt path: ${report.promptPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCopilotAgentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCopilotAgentHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorEcaCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorEcaSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorElyraCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorElyraSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorFirebaseStudioCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorFirebaseStudioRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rules path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorForgecodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorForgeCodeInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGeminiCliCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGeminiCliHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGitlabDuoCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGitLabDuoRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGrokCliCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGrokCliHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGptmeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGptmeInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorJean2Command(args: ParsedArgs): Promise<number> {
  const report = await doctorJean2Instructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGrokBuildCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGrokBuildInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGrokBotCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGrokBotRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGooseCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGooseHints();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hints path: ${report.hintsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorGreptileCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorGreptileRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorQodoCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorQodoReviewConfig();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCoderabbitCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodeRabbitConfig();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorJetbrainsAiCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorJetBrainsAiRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorJunieCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorJunieInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorJulesCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorJulesInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorLeanctlCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorLeanCtlInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorKimiCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorKimiHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorLocalcodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorLocalCodePlugin();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`plugin dir: ${report.pluginDir}\n`);
  process.stdout.write(`manifest path: ${report.manifestPath}\n`);
  process.stdout.write(`entrypoint path: ${report.indexPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorOpenhandsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorOpenHandsHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorOpenwebuiCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorOpenWebUITool();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`tool path: ${report.toolPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorMcpAgentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorMcpAgentDefinition();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`agent path: ${report.agentPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorMiniSweAgentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorMiniSweAgentConfig();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorSweAgentCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorSweAgentConfig();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorStagewiseCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorStagewiseSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorOpenInterpreterCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorOpenInterpreterInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorVscodeCopilotCommand(args: ParsedArgs): Promise<number> {
  if (args.printInstructions) {
    process.stdout.write(getVscodeCopilotInstructionsSnippet());
    return 0;
  }
  const report = await doctorVscodeCopilotHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorZedCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorZedInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rules path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorZencoderCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorZencoderRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorRooCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorRooInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rules path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorRovoCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorRovoInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorRulerCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorRulerRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorTabnineCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorTabnineInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorTabbyCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorTabbySystemPrompt();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorTraeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorTraeRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorUipathCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorUiPathInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorKiloCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorKiloRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorMistralVibeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorMistralVibeInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorMuxCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorMuxHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hook path: ${report.hookPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorNovakitCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorNovaKitInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorKnownsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorKnownsInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorOnaCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorOnaSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorWarpCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorWarpInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorKiroCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorKiroSteering();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`steering path: ${report.steeringPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorWindsurfCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorWindsurfRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCopilotCliCommand(args: ParsedArgs): Promise<number> {
  if (args.printInstructions) {
    process.stdout.write(getCopilotCliInstructionsSnippet());
    return 0;
  }
  const report = await doctorCopilotCliHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorClaudeCodeCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorClaudeCodeHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorClineCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorClineHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`hook path: ${report.hookPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCodebuffCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodebuffInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCodeantCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodeAntInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCodegenCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodegenInstructions();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCoderAgentsCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCoderAgentsSkill();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorCodebuddyCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorCodeBuddyHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorContinueCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorContinueRule();

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

async function doctorDroidCommand(args: ParsedArgs): Promise<number> {
  const report = await doctorDroidHook(undefined, { local: args.local });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("issues:\n");
    for (const issue of report.issues) {
      process.stdout.write(`- ${issue}\n`);
    }
  }
  if (report.advisories.length > 0) {
    process.stdout.write("advisories:\n");
    for (const advisory of report.advisories) {
      process.stdout.write(`- ${advisory}\n`);
    }
  }
  if (report.missingPaths.length > 0) {
    process.stdout.write("missing paths:\n");
    for (const path of report.missingPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

export const doctorCommands: ReadonlyMap<string, HostCommandHandler> = new Map<string, HostCommandHandler>([
  ["hooks", doctorHooksCommand],
  ["adal", doctorAdalCommand],
  ["aether", doctorAetherCommand],
  ["aider", doctorAiderCommand],
  ["aictl", doctorAictlCommand],
  ["ai-memory-protocol", doctorAiMemoryProtocolCommand],
  ["aimemoryprotocol", doctorAiMemoryProtocolCommand],
  ["agent-layer", doctorAgentLayerCommand],
  ["agentinit", doctorAgentinitCommand],
  ["agent-init", doctorAgentinitCommand],
  ["agentlink", doctorAgentlinkCommand],
  ["agentloom", doctorAgentloomCommand],
  ["agents-cli", doctorAgentsCliCommand],
  ["agents-md", doctorAgentsMdCommand],
  ["agentsmd", doctorAgentsMdCommand],
  ["agentsge", doctorAgentsgeCommand],
  ["agentsmesh", doctorAgentsmeshCommand],
  ["amazon-q", doctorAmazonQCommand],
  ["amp", doctorAmpCommand],
  ["antigravity", doctorAntigravityCommand],
  ["anywhere-agents", doctorAnywhereAgentsCommand],
  ["augment", doctorAugmentCommand],
  ["avante", doctorAvanteCommand],
  ["baz", doctorBazCommand],
  ["bito", doctorBitoCommand],
  ["blackbox", doctorBlackboxCommand],
  ["blocks", doctorBlocksCommand],
  ["clawdbot", doctorClawdbotCommand],
  ["bob", doctorBobCommand],
  ["builder", doctorBuilderCommand],
  ["charlie", doctorCharlieCommand],
  ["codex", doctorCodexCommand],
  ["pi", doctorPiCommand],
  ["pi-go", doctorPiGoCommand],
  ["pigo", doctorPiGoCommand],
  ["opencode", doctorOpencodeCommand],
  ["plandex", doctorPlandexCommand],
  ["qoder", doctorQoderCommand],
  ["replit", doctorReplitCommand],
  ["replit-agent", doctorReplitCommand],
  ["qwen-code", doctorQwenCodeCommand],
  ["command-code", doctorCommandCodeCommand],
  ["commandcode", doctorCommandCodeCommand],
  ["crush", doctorCrushCommand],
  ["cursor", doctorCursorCommand],
  ["deepagents", doctorDeepagentsCommand],
  ["devin", doctorDevinCommand],
  ["dot-agents", doctorDotAgentsCommand],
  ["docker-agent", doctorDockerAgentCommand],
  ["dockeragent", doctorDockerAgentCommand],
  ["cagent", doctorDockerAgentCommand],
  ["copilot-agent", doctorCopilotAgentCommand],
  ["eca", doctorEcaCommand],
  ["elyra", doctorElyraCommand],
  ["firebase-studio", doctorFirebaseStudioCommand],
  ["forgecode", doctorForgecodeCommand],
  ["forge-code", doctorForgecodeCommand],
  ["gemini-cli", doctorGeminiCliCommand],
  ["gitlab-duo", doctorGitlabDuoCommand],
  ["grok-cli", doctorGrokCliCommand],
  ["gptme", doctorGptmeCommand],
  ["jean2", doctorJean2Command],
  ["grok-build", doctorGrokBuildCommand],
  ["grok-bot", doctorGrokBotCommand],
  ["grokbot", doctorGrokBotCommand],
  ["goose", doctorGooseCommand],
  ["greptile", doctorGreptileCommand],
  ["qodo", doctorQodoCommand],
  ["coderabbit", doctorCoderabbitCommand],
  ["jetbrains-ai", doctorJetbrainsAiCommand],
  ["junie", doctorJunieCommand],
  ["jules", doctorJulesCommand],
  ["leanctl", doctorLeanctlCommand],
  ["kimi", doctorKimiCommand],
  ["localcode", doctorLocalcodeCommand],
  ["local-code", doctorLocalcodeCommand],
  ["openhands", doctorOpenhandsCommand],
  ["openwebui", doctorOpenwebuiCommand],
  ["mcp-agent", doctorMcpAgentCommand],
  ["mcpagent", doctorMcpAgentCommand],
  ["mini-swe-agent", doctorMiniSweAgentCommand],
  ["mini-sweagent", doctorMiniSweAgentCommand],
  ["swe-agent", doctorSweAgentCommand],
  ["sweagent", doctorSweAgentCommand],
  ["stagewise", doctorStagewiseCommand],
  ["open-interpreter", doctorOpenInterpreterCommand],
  ["openinterpreter", doctorOpenInterpreterCommand],
  ["vscode-copilot", doctorVscodeCopilotCommand],
  ["zed", doctorZedCommand],
  ["zencoder", doctorZencoderCommand],
  ["roo", doctorRooCommand],
  ["rovo", doctorRovoCommand],
  ["rovo-dev", doctorRovoCommand],
  ["ruler", doctorRulerCommand],
  ["tabnine", doctorTabnineCommand],
  ["tabby", doctorTabbyCommand],
  ["trae", doctorTraeCommand],
  ["uipath", doctorUipathCommand],
  ["kilo", doctorKiloCommand],
  ["mistral-vibe", doctorMistralVibeCommand],
  ["mistralvibe", doctorMistralVibeCommand],
  ["mux", doctorMuxCommand],
  ["novakit", doctorNovakitCommand],
  ["knowns", doctorKnownsCommand],
  ["ona", doctorOnaCommand],
  ["warp", doctorWarpCommand],
  ["kiro", doctorKiroCommand],
  ["windsurf", doctorWindsurfCommand],
  ["copilot-cli", doctorCopilotCliCommand],
  ["claude-code", doctorClaudeCodeCommand],
  ["cline", doctorClineCommand],
  ["codebuff", doctorCodebuffCommand],
  ["codeant", doctorCodeantCommand],
  ["codegen", doctorCodegenCommand],
  ["coder-agents", doctorCoderAgentsCommand],
  ["coderagents", doctorCoderAgentsCommand],
  ["codebuddy", doctorCodebuddyCommand],
  ["continue", doctorContinueCommand],
  ["droid", doctorDroidCommand],
]);
