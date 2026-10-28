// Per-target handlers for `tokenjuice install <target>`.
// Each handler is keyed by the target name and its aliases in installCommands.

import { dirname, relative } from "node:path";
import { installAdalInstructions } from "../hosts/adal/index.js";
import { installAetherPrompt } from "../hosts/aether/index.js";
import { installAictlInstructions } from "../hosts/aictl/index.js";
import { installAiMemoryProtocolMemory } from "../hosts/ai-memory-protocol/index.js";
import { installAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { installAgentInitInstructions } from "../hosts/agentinit/index.js";
import { installAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { installAgentloomRule } from "../hosts/agentloom/index.js";
import { installAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { installAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { installAgentsGeRule } from "../hosts/agentsge/index.js";
import { installAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { installAmazonQRule } from "../hosts/amazon-q/index.js";
import { installAmpInstructions } from "../hosts/amp/index.js";
import { installAiderConvention } from "../hosts/aider/index.js";
import { installAntigravityRule } from "../hosts/antigravity/index.js";
import { installAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { installAugmentRule } from "../hosts/augment/index.js";
import { installAvanteInstructions } from "../hosts/avante/index.js";
import { installBazSkill } from "../hosts/baz/index.js";
import { installBitoGuidelines } from "../hosts/bito/index.js";
import { installBlackboxSkill } from "../hosts/blackbox/index.js";
import { installBlocksSkill } from "../hosts/blocks/index.js";
import { installClawdbotSkill } from "../hosts/clawdbot/index.js";
import { installBobInstructions } from "../hosts/bob/index.js";
import { installBuilderRule } from "../hosts/builder/index.js";
import { installCharlieInstructions } from "../hosts/charlie/index.js";
import { installClaudeCodeHook } from "../hosts/claude-code/index.js";
import { installClineHook } from "../hosts/cline/index.js";
import { installCodeAntInstructions } from "../hosts/codeant/index.js";
import { installCodebuffInstructions } from "../hosts/codebuff/index.js";
import { installCodegenInstructions } from "../hosts/codegen/index.js";
import { installCoderAgentsSkill } from "../hosts/coder-agents/index.js";
import { installCodeRabbitConfig } from "../hosts/coderabbit/index.js";
import { installCodeBuddyHook } from "../hosts/codebuddy/index.js";
import { installCommandCodeHook } from "../hosts/command-code/index.js";
import { installContinueRule } from "../hosts/continue/index.js";
import { installCodexHook } from "../hosts/codex/index.js";
import { installCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import { installCopilotCliHook } from "../hosts/copilot-cli/index.js";
import { installCrushSkill } from "../hosts/crush/index.js";
import { installCursorHook } from "../hosts/cursor/index.js";
import { installDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { installDevinHook } from "../hosts/devin/index.js";
import { installDotAgentsRule } from "../hosts/dot-agents/index.js";
import { installDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { installDroidHook } from "../hosts/droid/index.js";
import { installEcaSkill } from "../hosts/eca/index.js";
import { installElyraSkill } from "../hosts/elyra/index.js";
import { installFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { installForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { installGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { installGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { installGooseHints } from "../hosts/goose/index.js";
import { installGreptileRule } from "../hosts/greptile/index.js";
import { installGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { installGrokBotRule } from "../hosts/grok-bot/index.js";
import { installGrokCliHook } from "../hosts/grok-cli/index.js";
import { installGptmeInstructions } from "../hosts/gptme/index.js";
import { installJean2Instructions } from "../hosts/jean2/index.js";
import { installJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { installJunieInstructions } from "../hosts/junie/index.js";
import { installJulesInstructions } from "../hosts/jules/index.js";
import { installLeanCtlInstructions } from "../hosts/leanctl/index.js";
import { installKimiHook } from "../hosts/kimi/index.js";
import { installKiroSteering } from "../hosts/kiro/index.js";
import { installKiloRule } from "../hosts/kilo/index.js";
import { installKnownsInstructions } from "../hosts/knowns/index.js";
import { installLocalCodePlugin } from "../hosts/localcode/index.js";
import { installMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { installMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { installSweAgentConfig } from "../hosts/swe-agent/index.js";
import { installStagewiseSkill } from "../hosts/stagewise/index.js";
import { installMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { installMuxHook } from "../hosts/mux/index.js";
import { installNovaKitInstructions } from "../hosts/novakit/index.js";
import { installOnaSkill } from "../hosts/ona/index.js";
import { installOpenCodeExtension } from "../hosts/opencode/index.js";
import { installOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { installOpenHandsHook } from "../hosts/openhands/index.js";
import { installOpenWebUITool } from "../hosts/openwebui/index.js";
import { installPiExtension } from "../hosts/pi/index.js";
import { installPiGoSkill } from "../hosts/pi-go/index.js";
import { installPlandexConvention } from "../hosts/plandex/index.js";
import { installQodoReviewConfig } from "../hosts/qodo/index.js";
import { installQoderInstructions } from "../hosts/qoder/index.js";
import { installQwenCodeHook } from "../hosts/qwen-code/index.js";
import { installReplitInstructions } from "../hosts/replit/index.js";
import { installRooInstructions } from "../hosts/roo/index.js";
import { installRovoInstructions } from "../hosts/rovo/index.js";
import { installRulerRule } from "../hosts/ruler/index.js";
import { installTabbySystemPrompt } from "../hosts/tabby/index.js";
import { installTabnineInstructions } from "../hosts/tabnine/index.js";
import { installTraeRule } from "../hosts/trae/index.js";
import { installUiPathInstructions } from "../hosts/uipath/index.js";
import { installVscodeCopilotHook } from "../hosts/vscode-copilot/index.js";
import { installWarpInstructions } from "../hosts/warp/index.js";
import { installWindsurfRule } from "../hosts/windsurf/index.js";
import { installZedInstructions } from "../hosts/zed/index.js";
import { installZencoderRule } from "../hosts/zencoder/index.js";
import { shellQuote } from "../hosts/shared/hook-command.js";
import { formatCodeBuddyInstallSuccess, formatInstallSuccess } from "./install-output.js";
import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

function formatPlandexLoadCommand(conventionPath: string): string {
  const loadPath = relative(process.cwd(), conventionPath) || "PLANDEX.tokenjuice.md";
  return `plandex load ${shellQuote(loadPath)}`;
}

async function installAdalCommand(args: ParsedArgs): Promise<number> {
  const result = await installAdalInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; AdaL CLI still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor adal" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("adal", "instructions", details));
  return 0;
}

async function installAetherCommand(args: ParsedArgs): Promise<number> {
  const result = await installAetherPrompt();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Prompt", value: result.promptPath },
    { label: "Settings", value: result.settingsPath },
    { label: "Beta", value: "Aether prompt source; adds .aether/tokenjuice.md to configured agent prompts" },
    { label: "Verify", value: "tokenjuice doctor aether" },
    { label: "Prompt check", value: "aether show-prompt -a <agent>" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  if (result.settingsBackupPath) {
    details.push({ label: "Settings backup", value: result.settingsBackupPath });
  }
  details.push({ label: "Agents updated", value: String(result.agentsUpdated) });
  process.stdout.write(formatInstallSuccess("aether", "prompt", details));
  return 0;
}

async function installAiderCommand(args: ParsedArgs): Promise<number> {
  const result = await installAiderConvention();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Convention", value: result.conventionPath },
    { label: "Beta", value: "convention-based guidance; load it with aider --read CONVENTIONS.tokenjuice.md" },
    { label: "Verify", value: "tokenjuice doctor aider" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("aider", "convention", details));
  return 0;
}

async function installAictlCommand(args: ParsedArgs): Promise<number> {
  const result = await installAictlInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "AICTL.md project prompt guidance; aictl still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor aictl" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("aictl", "instructions", details));
  return 0;
}

async function installAiMemoryProtocolCommand(args: ParsedArgs): Promise<number> {
  const result = await installAiMemoryProtocolMemory();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const memoryDir = dirname(dirname(result.memoryPath));
  const details = [
    { label: "Memory", value: result.memoryPath },
    { label: "Beta", value: "RST preference memory; AI Memory Protocol still owns recall and MCP serving" },
    { label: "Workspace", value: "requires memory init .memories --install first" },
    { label: "Rebuild", value: `MEMORY_DIR=${shellQuote(memoryDir)} memory rebuild` },
    { label: "Verify", value: "tokenjuice doctor ai-memory-protocol" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("ai-memory-protocol", "memory", details));
  return 0;
}

async function installAgentLayerCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentLayerInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "Agent Layer source instructions; requires an initialized al project" },
    { label: "Init", value: "al init" },
    { label: "Sync", value: "al sync" },
    { label: "Verify", value: "tokenjuice doctor agent-layer" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agent-layer", "instructions", details));
  return 0;
}

async function installAgentinitCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentInitInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "AgentInit source AGENTS.md guidance; run agentinit sync to propagate it" },
    { label: "Sync", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor agentinit" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agentinit", "instructions", details));
  return 0;
}

async function installAgentlinkCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentlinkInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "source AGENTS.md guidance; run agentlink sync to repair downstream symlinks" },
    { label: "Sync", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor agentlink" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agentlink", "instructions", details));
  return 0;
}

async function installAgentloomCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentloomRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "Agentloom source rule; run agentloom sync to propagate it" },
    { label: "Sync", value: "agentloom sync" },
    { label: "Verify", value: "tokenjuice doctor agentloom" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agentloom", "rule", details));
  return 0;
}

async function installAgentsCliCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentsCliMemory();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Memory", value: result.instructionsPath },
    { label: "Beta", value: "agents-cli memory source; run agents sync to propagate it" },
    { label: "Sync", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor agents-cli" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agents-cli", "memory", details));
  return 0;
}

async function installAgentsMdCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentsMdInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "generic AGENTS.md guidance; the active agent still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor agents-md" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agents-md", "instructions", details));
  return 0;
}

async function installAgentsgeCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentsGeRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "agents.ge source rule; run agents sync to propagate it" },
    { label: "Sync", value: "agents sync" },
    { label: "Verify", value: "tokenjuice doctor agentsge" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agentsge", "rule", details));
  return 0;
}

async function installAgentsmeshCommand(args: ParsedArgs): Promise<number> {
  const result = await installAgentsMeshRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "AgentsMesh source rule; requires an initialized agentsmesh project" },
    { label: "Init", value: "agentsmesh init" },
    { label: "Generate", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor agentsmesh" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("agentsmesh", "rule", details));
  return 0;
}

async function installAmazonQCommand(args: ParsedArgs): Promise<number> {
  const result = await installAmazonQRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based Amazon Q/Kiro compatibility guidance" },
    { label: "Load", value: "add file://.amazonq/rules/**/*.md to the active agent resources" },
    { label: "Verify", value: "tokenjuice doctor amazon-q" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("amazon-q", "rule", details));
  return 0;
}

async function installAmpCommand(args: ParsedArgs): Promise<number> {
  const result = await installAmpInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Amp still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor amp" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  if (result.instructionsPaths && result.instructionsPaths.length > 1) {
    details.push({ label: "Updated paths", value: result.instructionsPaths.join(", ") });
  }
  process.stdout.write(formatInstallSuccess("amp", "instructions", details));
  return 0;
}

async function installAntigravityCommand(args: ParsedArgs): Promise<number> {
  const result = await installAntigravityRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Antigravity still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor antigravity" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("antigravity", "rule", details));
  return 0;
}

async function installAnywhereAgentsCommand(args: ParsedArgs): Promise<number> {
  const result = await installAnywhereAgentsInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "AGENTS.local.md guidance; run anywhere-agents to regenerate downstream files" },
    { label: "Sync", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor anywhere-agents" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("anywhere-agents", "instructions", details));
  return 0;
}

async function installAugmentCommand(args: ParsedArgs): Promise<number> {
  const result = await installAugmentRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Augment still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor augment" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("augment", "rule", details));
  return 0;
}

async function installAvanteCommand(args: ParsedArgs): Promise<number> {
  const result = await installAvanteInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Avante still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor avante" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("avante", "instructions", details));
  return 0;
}

async function installBazCommand(args: ParsedArgs): Promise<number> {
  const result = await installBazSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Baz still owns review, fixer, and shell execution" },
    { label: "Verify", value: "tokenjuice doctor baz" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("baz", "skill", details));
  return 0;
}

async function installBitoCommand(args: ParsedArgs): Promise<number> {
  const result = await installBitoGuidelines();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Guidelines", value: result.guidelinesPath },
    { label: "Beta", value: "custom-guidelines guidance; Bito still owns PR review and tools" },
    { label: "Verify", value: "tokenjuice doctor bito" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.configBackupPath) {
    details.push({ label: "Config backup", value: result.configBackupPath });
  }
  if (result.guidelinesBackupPath) {
    details.push({ label: "Guidelines backup", value: result.guidelinesBackupPath });
  }
  process.stdout.write(formatInstallSuccess("bito", "custom guidelines", details));
  return 0;
}

async function installBlackboxCommand(args: ParsedArgs): Promise<number> {
  const result = await installBlackboxSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Blackbox still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor blackbox" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("blackbox", "skill", details));
  return 0;
}

async function installBlocksCommand(args: ParsedArgs): Promise<number> {
  const result = await installBlocksSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Blocks still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor blocks" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("blocks", "skill", details));
  return 0;
}

async function installClawdbotCommand(args: ParsedArgs): Promise<number> {
  const result = await installClawdbotSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Clawdbot still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor clawdbot" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("clawdbot", "skill", details));
  return 0;
}

async function installBobCommand(args: ParsedArgs): Promise<number> {
  const result = await installBobInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; IBM Bob still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor bob" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("bob", "instructions", details));
  return 0;
}

async function installBuilderCommand(args: ParsedArgs): Promise<number> {
  const result = await installBuilderRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Builder still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor builder" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("builder", "rule", details));
  return 0;
}

async function installCharlieCommand(args: ParsedArgs): Promise<number> {
  const result = await installCharlieInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "AGENTS.md-based guidance; Charlie still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor charlie" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("charlie", "instructions", details));
  return 0;
}

async function installCodexCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodexHook(undefined, {
    local: args.local,
    ...(args.noOmit ? { noOmit: true } : {}),
  });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
    { label: "Writer", value: `${result.writer} (${result.fragmentId})` },
  ];
  if (result.featureFlag.enabled) {
    const source = result.featureFlag.key ? `[features].${result.featureFlag.key}` : "default-on";
    details.push({ label: "Feature flag", value: `hooks enabled via ${source} (${result.featureFlag.configPath})` });
  } else {
    const where = result.featureFlag.configExists
      ? `${result.featureFlag.configPath} (missing or disabled)`
      : `no ${result.featureFlag.configPath}`;
    details.push({ label: "Feature flag", value: `hooks disabled - ${where}` });
    details.push({ label: "Enable", value: result.featureFlag.fixHint });
  }
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
  details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
  process.stdout.write(formatInstallSuccess("codex", "hook", details));
  return 0;
}

async function installClaudeCodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installClaudeCodeHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
  process.stdout.write(formatInstallSuccess("claude-code", "hook", details));
  return 0;
}

async function installClineCommand(args: ParsedArgs): Promise<number> {
  const result = await installClineHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hookPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "enable this PostToolUse hook in Cline's Hooks tab after install" },
    { label: "Verify", value: `tokenjuice doctor cline${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  process.stdout.write(formatInstallSuccess("cline", "hook", details));
  return 0;
}

async function installCodeantCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodeAntInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instructions-based guidance; CodeAnt still owns review and fixes" },
    { label: "Verify", value: "tokenjuice doctor codeant" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("codeant", "instructions", details));
  return 0;
}

async function installCodebuffCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodebuffInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Codebuff still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor codebuff" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("codebuff", "instructions", details));
  return 0;
}

async function installCodegenCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodegenInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "rule-file guidance; Codegen still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor codegen" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("codegen", "instructions", details));
  return 0;
}

async function installCoderAgentsCommand(args: ParsedArgs): Promise<number> {
  const result = await installCoderAgentsSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Coder Agents still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor coder-agents" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("coder-agents", "skill", details));
  return 0;
}

async function installCodebuddyCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodeBuddyHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(formatCodeBuddyInstallSuccess({ ...result, local: args.local }));
  return 0;
}

async function installCommandCodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installCommandCodeHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "PostToolUse shell hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor command-code${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("command-code", "hook", details));
  return 0;
}

async function installContinueCommand(args: ParsedArgs): Promise<number> {
  const result = await installContinueRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Continue still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor continue" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("continue", "rule", details));
  return 0;
}

async function installCopilotAgentCommand(args: ParsedArgs): Promise<number> {
  const result = await installCopilotAgentHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "repo-level PostToolUse hook for Copilot coding agent bash output" },
    { label: "Verify", value: `tokenjuice doctor copilot-agent${args.local ? " --local" : ""}` },
    { label: "Cloud agent", value: "ensure tokenjuice is available in PATH before Copilot cloud agent hooks run" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("copilot-agent", "hook", details));
  return 0;
}

async function installCrushCommand(args: ParsedArgs): Promise<number> {
  const result = await installCrushSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "project-local Agent Skill; Crush still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor crush" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("crush", "skill", details));
  return 0;
}

async function installCursorCommand(args: ParsedArgs): Promise<number> {
  const result = await installCursorHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
  details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
  process.stdout.write(formatInstallSuccess("cursor", "hook", details));
  return 0;
}

async function installDeepagentsCommand(args: ParsedArgs): Promise<number> {
  const result = await installDeepAgentsInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Deep Agents Code still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor deepagents" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("deepagents", "instructions", details));
  return 0;
}

async function installDevinCommand(args: ParsedArgs): Promise<number> {
  const result = await installDevinHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "project-local PreToolUse hook rewrites exec commands before Devin runs them" },
    { label: "Verify", value: `tokenjuice doctor devin${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("devin", "hook", details));
  return 0;
}

async function installDotAgentsCommand(args: ParsedArgs): Promise<number> {
  const result = await installDotAgentsRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "dot-agents global rule; run dot-agents sync to propagate it" },
    { label: "Sync", value: result.syncCommand },
    { label: "Verify", value: "tokenjuice doctor dot-agents" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("dot-agents", "rule", details));
  return 0;
}

async function installDockerAgentCommand(args: ParsedArgs): Promise<number> {
  const result = await installDockerAgentPrompt();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Prompt", value: result.promptPath },
    { label: "Beta", value: "prompt-file guidance; Docker Agent still owns command execution" },
    { label: "Load", value: "add .docker-agent/tokenjuice.md to agents.<name>.add_prompt_files" },
    { label: "Verify", value: "tokenjuice doctor docker-agent" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("docker-agent", "prompt", details));
  return 0;
}

async function installEcaCommand(args: ParsedArgs): Promise<number> {
  const result = await installEcaSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "project skill guidance; ECA still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor eca" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("eca", "skill", details));
  return 0;
}

async function installElyraCommand(args: ParsedArgs): Promise<number> {
  const result = await installElyraSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "project skill guidance; Elyra still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor elyra" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("elyra", "skill", details));
  return 0;
}

async function installFirebaseStudioCommand(args: ParsedArgs): Promise<number> {
  const result = await installFirebaseStudioRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rules", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Gemini in Firebase still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor firebase-studio" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("firebase-studio", "rules", details));
  return 0;
}

async function installForgecodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installForgeCodeInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "ForgeCode AGENTS.md guidance; ForgeCode still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor forgecode" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("forgecode", "instructions", details));
  return 0;
}

async function installGeminiCliCommand(args: ParsedArgs): Promise<number> {
  const result = await installGeminiCliHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "AfterTool output replacement is new; verify with a noisy shell command" },
    { label: "Verify", value: `tokenjuice doctor gemini-cli${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("gemini-cli", "hook", details));
  return 0;
}

async function installGitlabDuoCommand(args: ParsedArgs): Promise<number> {
  const result = await installGitLabDuoRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "custom-rules guidance; GitLab Duo still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor gitlab-duo" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("gitlab-duo", "rule", details));
  return 0;
}

async function installGrokCliCommand(args: ParsedArgs): Promise<number> {
  const result = await installGrokCliHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "user-level PostToolUse hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor grok-cli${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("grok-cli", "hook", details));
  return 0;
}

async function installGptmeCommand(args: ParsedArgs): Promise<number> {
  const result = await installGptmeInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; gptme still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor gptme" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("gptme", "instructions", details));
  return 0;
}

async function installJean2Command(args: ParsedArgs): Promise<number> {
  const result = await installJean2Instructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-file guidance; Jean2 still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor jean2" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("jean2", "instructions", details));
  return 0;
}

async function installGrokBuildCommand(args: ParsedArgs): Promise<number> {
  const result = await installGrokBuildInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Grok Build still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor grok-build" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("grok-build", "instructions", details));
  return 0;
}

async function installGrokBotCommand(args: ParsedArgs): Promise<number> {
  const result = await installGrokBotRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: ".cursor/rules guidance; Grok Bot still owns execution and output delivery" },
    { label: "Verify", value: "tokenjuice doctor grok-bot" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("grok-bot", "rule", details));
  return 0;
}

async function installGooseCommand(args: ParsedArgs): Promise<number> {
  const result = await installGooseHints();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hints", value: result.hintsPath },
    { label: "Beta", value: "hints-based guidance; Goose still owns command execution" },
    { label: "Reload", value: "restart Goose so the updated .goosehints file is loaded" },
    { label: "Verify", value: "tokenjuice doctor goose" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("goose", "hints", details));
  return 0;
}

async function installGreptileCommand(args: ParsedArgs): Promise<number> {
  const result = await installGreptileRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rules-based guidance; Greptile still owns PR review and runtime inspection" },
    { label: "Verify", value: "tokenjuice doctor greptile" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("greptile", "rule", details));
  return 0;
}

async function installQodoCommand(args: ParsedArgs): Promise<number> {
  const result = await installQodoReviewConfig();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "review-guideline guidance; Qodo still owns PR review and CI feedback" },
    { label: "Verify", value: "tokenjuice doctor qodo" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("qodo", "review config", details));
  return 0;
}

async function installCoderabbitCommand(args: ParsedArgs): Promise<number> {
  const result = await installCodeRabbitConfig();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "path-instruction guidance; CodeRabbit still owns PR review and tools" },
    { label: "Verify", value: "tokenjuice doctor coderabbit" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("coderabbit", "review config", details));
  return 0;
}

async function installJetbrainsAiCommand(args: ParsedArgs): Promise<number> {
  const result = await installJetBrainsAiRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; JetBrains AI Assistant still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor jetbrains-ai" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("jetbrains-ai", "rule", details));
  return 0;
}

async function installJunieCommand(args: ParsedArgs): Promise<number> {
  const result = await installJunieInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Junie still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor junie" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("junie", "instructions", details));
  return 0;
}

async function installJulesCommand(args: ParsedArgs): Promise<number> {
  const result = await installJulesInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Jules still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor jules" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("jules", "instructions", details));
  return 0;
}

async function installLeanctlCommand(args: ParsedArgs): Promise<number> {
  const result = await installLeanCtlInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "project instruction guidance; LeanCTL still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor leanctl" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("leanctl", "instructions", details));
  return 0;
}

async function installKimiCommand(args: ParsedArgs): Promise<number> {
  const result = await installKimiHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "PostToolUse Shell hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor kimi${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("kimi", "hook", details));
  return 0;
}

async function installLocalcodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installLocalCodePlugin();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Plugin", value: result.pluginDir },
    { label: "Manifest", value: result.manifestPath },
    { label: "Entrypoint", value: result.indexPath },
    { label: "Tool", value: "tokenjuice_compact_terminal_output" },
    { label: "Command", value: "/tokenjuice" },
    { label: "Beta", value: "plugin tool/command; compacts provided output only" },
    { label: "Verify", value: "tokenjuice doctor localcode" },
  ];
  if (result.manifestBackupPath) {
    details.push({ label: "Manifest backup", value: result.manifestBackupPath });
  }
  if (result.indexBackupPath) {
    details.push({ label: "Entrypoint backup", value: result.indexBackupPath });
  }
  process.stdout.write(formatInstallSuccess("localcode", "plugin", details));
  return 0;
}

async function installKiroCommand(args: ParsedArgs): Promise<number> {
  const result = await installKiroSteering();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Steering", value: result.steeringPath },
    { label: "Beta", value: "steering-based guidance; Kiro still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor kiro" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("kiro", "steering", details));
  return 0;
}

async function installKiloCommand(args: ParsedArgs): Promise<number> {
  const result = await installKiloRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "rule-based guidance; Kilo Code still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor kilo" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  if (result.configBackupPath) {
    details.push({ label: "Config backup", value: result.configBackupPath });
  }
  process.stdout.write(formatInstallSuccess("kilo", "rule", details));
  return 0;
}

async function installMcpAgentCommand(args: ParsedArgs): Promise<number> {
  const result = await installMcpAgentDefinition();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Agent", value: result.agentPath },
    { label: "Beta", value: "agent-file guidance; mcp-agent still owns command execution" },
    { label: "Load", value: "enable .mcp-agent/agents in mcp_agent.config.yaml agents.search_paths" },
    { label: "Verify", value: "tokenjuice doctor mcp-agent" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("mcp-agent", "agent", details));
  return 0;
}

async function installMistralVibeCommand(args: ParsedArgs): Promise<number> {
  const result = await installMistralVibeInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Mistral Vibe still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor mistral-vibe" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("mistral-vibe", "instructions", details));
  return 0;
}

async function installMiniSweAgentCommand(args: ParsedArgs): Promise<number> {
  const result = await installMiniSweAgentConfig();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "config-fragment guidance; mini-SWE-agent still owns command execution" },
    { label: "Load", value: "mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml" },
    { label: "Verify", value: "tokenjuice doctor mini-swe-agent" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("mini-swe-agent", "config", details));
  return 0;
}

async function installSweAgentCommand(args: ParsedArgs): Promise<number> {
  const result = await installSweAgentConfig();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "config-fragment guidance; SWE-agent still owns command execution" },
    { label: "Load", value: "sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml" },
    { label: "Verify", value: "tokenjuice doctor swe-agent" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("swe-agent", "config", details));
  return 0;
}

async function installStagewiseCommand(args: ParsedArgs): Promise<number> {
  const result = await installStagewiseSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Stagewise still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor stagewise" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("stagewise", "skill", details));
  return 0;
}

async function installMuxCommand(args: ParsedArgs): Promise<number> {
  const result = await installMuxHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hookPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "project-local tool_post hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor mux${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("mux", "hook", details));
  return 0;
}

async function installNovakitCommand(args: ParsedArgs): Promise<number> {
  const result = await installNovaKitInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "NOVAKIT.md guidance; NovaKit still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor novakit" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("novakit", "instructions", details));
  return 0;
}

async function installKnownsCommand(args: ParsedArgs): Promise<number> {
  const result = await installKnownsInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "KNOWNS.md guidance; Knowns still owns MCP/project memory" },
    { label: "Verify", value: "tokenjuice doctor knowns" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("knowns", "instructions", details));
  return 0;
}

async function installOnaCommand(args: ParsedArgs): Promise<number> {
  const result = await installOnaSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "workspace skill guidance; Ona still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor ona" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("ona", "skill", details));
  return 0;
}

async function installWarpCommand(args: ParsedArgs): Promise<number> {
  const result = await installWarpInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Warp still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor warp" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("warp", "instructions", details));
  return 0;
}

async function installOpenhandsCommand(args: ParsedArgs): Promise<number> {
  const result = await installOpenHandsHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "project-local PostToolUse hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor openhands${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("openhands", "hook", details));
  return 0;
}

async function installOpenInterpreterCommand(args: ParsedArgs): Promise<number> {
  const result = await installOpenInterpreterInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Open Interpreter still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor open-interpreter" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("open-interpreter", "instructions", details));
  return 0;
}

async function installOpenwebuiCommand(args: ParsedArgs): Promise<number> {
  const result = await installOpenWebUITool();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Tool source", value: result.toolPath },
    { label: "Beta", value: "Workspace Tool export; review and import manually in Open WebUI" },
    { label: "Safety", value: "compacts provided output only; does not execute user commands" },
    { label: "Verify", value: "tokenjuice doctor openwebui" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("openwebui", "tool source", details));
  return 0;
}

async function installPlandexCommand(args: ParsedArgs): Promise<number> {
  const result = await installPlandexConvention();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Convention", value: result.conventionPath },
    { label: "Beta", value: "context-based guidance; Plandex still owns command execution" },
    { label: "Load", value: formatPlandexLoadCommand(result.conventionPath) },
    { label: "Verify", value: "tokenjuice doctor plandex" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("plandex", "convention", details));
  return 0;
}

async function installQoderCommand(args: ParsedArgs): Promise<number> {
  const result = await installQoderInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Qoder still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor qoder" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("qoder", "instructions", details));
  return 0;
}

async function installReplitCommand(args: ParsedArgs): Promise<number> {
  const result = await installReplitInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Replit Agent still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor replit" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("replit", "instructions", details));
  return 0;
}

async function installQwenCodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installQwenCodeHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "project-local PostToolUse hook; compacted context is injected alongside original output" },
    { label: "Verify", value: `tokenjuice doctor qwen-code${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("qwen-code", "hook", details));
  return 0;
}

async function installPiCommand(args: ParsedArgs): Promise<number> {
  const result = await installPiExtension(undefined, {
    local: args.local,
    skipCommandNames: args.skipCommandNames,
  });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Extension", value: result.extensionPath },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  if (args.skipCommandNames.length > 0) {
    details.push({ label: "Skipped commands", value: [...new Set(args.skipCommandNames)].join(", ") });
  }
  details.push({ label: "Reload", value: "/reload" });
  details.push({ label: "Usage in pi", value: "/tj status | /tj on | /tj off | /tj raw-next" });
  process.stdout.write(formatInstallSuccess("pi", "extension", details));
  return 0;
}

async function installPiGoCommand(args: ParsedArgs): Promise<number> {
  const result = await installPiGoSkill();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "project skill guidance; pi-go still owns shell execution" },
    { label: "Verify", value: "tokenjuice doctor pi-go" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("pi-go", "skill", details));
  return 0;
}

async function installOpencodeCommand(args: ParsedArgs): Promise<number> {
  const result = await installOpenCodeExtension(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Extension", value: result.extensionPath },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Reload", value: "restart opencode (the plugin is auto-loaded on session start)" });
  details.push({ label: "Verify", value: "tokenjuice doctor opencode" });
  process.stdout.write(formatInstallSuccess("opencode", "extension", details));
  return 0;
}

async function installRooCommand(args: ParsedArgs): Promise<number> {
  const result = await installRooInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rules", value: result.instructionsPath },
    { label: "Beta", value: "rule-based guidance; Roo Code still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor roo" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("roo", "rules", details));
  return 0;
}

async function installRovoCommand(args: ParsedArgs): Promise<number> {
  const result = await installRovoInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Rovo Dev CLI still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor rovo" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("rovo", "instructions", details));
  return 0;
}

async function installRulerCommand(args: ParsedArgs): Promise<number> {
  const result = await installRulerRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; run ruler apply to propagate it" },
    { label: "Apply", value: "ruler apply" },
    { label: "Verify", value: "tokenjuice doctor ruler" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("ruler", "rule", details));
  return 0;
}

async function installTabnineCommand(args: ParsedArgs): Promise<number> {
  const result = await installTabnineInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-based guidance; Tabnine CLI still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor tabnine" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("tabnine", "instructions", details));
  return 0;
}

async function installTabbyCommand(args: ParsedArgs): Promise<number> {
  const result = await installTabbySystemPrompt();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Config", value: result.configPath },
    { label: "Beta", value: "system-prompt guidance; Tabby still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor tabby" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("tabby", "system prompt", details));
  return 0;
}

async function installTraeCommand(args: ParsedArgs): Promise<number> {
  const result = await installTraeRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Trae still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor trae" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("trae", "rule", details));
  return 0;
}

async function installUipathCommand(args: ParsedArgs): Promise<number> {
  const result = await installUiPathInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Instructions", value: result.instructionsPath },
    { label: "Beta", value: "instruction-file guidance; the active coding agent still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor uipath" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("uipath", "instructions", details));
  return 0;
}

async function installVscodeCopilotCommand(args: ParsedArgs): Promise<number> {
  const result = await installVscodeCopilotHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  if (result.migratedFromPath) {
    details.push({ label: "Migrated", value: result.migratedFromPath });
  }
  details.push({ label: "Enable", value: "turn on chat.useHooks in VS Code settings and trust the workspace" });
  details.push({ label: "Guidance", value: "tokenjuice doctor vscode-copilot --print-instructions" });
  details.push({ label: "Verify", value: `tokenjuice doctor vscode-copilot${args.local ? " --local" : ""}` });
  details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
  process.stdout.write(formatInstallSuccess("vscode-copilot", "hook", details));
  return 0;
}

async function installWindsurfCommand(args: ParsedArgs): Promise<number> {
  const result = await installWindsurfRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Windsurf still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor windsurf" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("windsurf", "rule", details));
  return 0;
}

async function installCopilotCliCommand(args: ParsedArgs): Promise<number> {
  const result = await installCopilotCliHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.hooksPath },
    { label: "Command", value: result.command },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Guidance", value: "tokenjuice doctor copilot-cli --print-instructions" });
  details.push({ label: "Verify", value: `tokenjuice doctor copilot-cli${args.local ? " --local" : ""}` });
  details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
  process.stdout.write(formatInstallSuccess("copilot-cli", "hook", details));
  return 0;
}

async function installDroidCommand(args: ParsedArgs): Promise<number> {
  const result = await installDroidHook(undefined, { local: args.local });
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Verify", value: `tokenjuice doctor droid${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("droid", "hook", details));
  return 0;
}

async function installZedCommand(args: ParsedArgs): Promise<number> {
  const result = await installZedInstructions();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rules", value: result.instructionsPath },
    { label: "Beta", value: "rule-based guidance; Zed still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor zed" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("zed", "rules", details));
  return 0;
}

async function installZencoderCommand(args: ParsedArgs): Promise<number> {
  const result = await installZencoderRule();
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const details = [
    { label: "Rule", value: result.rulePath },
    { label: "Beta", value: "rule-based guidance; Zencoder still owns command execution" },
    { label: "Verify", value: "tokenjuice doctor zencoder" },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("zencoder", "rule", details));
  return 0;
}

export const installCommands: ReadonlyMap<string, HostCommandHandler> = new Map<string, HostCommandHandler>([
  ["adal", installAdalCommand],
  ["aether", installAetherCommand],
  ["aider", installAiderCommand],
  ["aictl", installAictlCommand],
  ["ai-memory-protocol", installAiMemoryProtocolCommand],
  ["aimemoryprotocol", installAiMemoryProtocolCommand],
  ["agent-layer", installAgentLayerCommand],
  ["agentinit", installAgentinitCommand],
  ["agent-init", installAgentinitCommand],
  ["agentlink", installAgentlinkCommand],
  ["agentloom", installAgentloomCommand],
  ["agents-cli", installAgentsCliCommand],
  ["agents-md", installAgentsMdCommand],
  ["agentsmd", installAgentsMdCommand],
  ["agentsge", installAgentsgeCommand],
  ["agentsmesh", installAgentsmeshCommand],
  ["amazon-q", installAmazonQCommand],
  ["amp", installAmpCommand],
  ["antigravity", installAntigravityCommand],
  ["anywhere-agents", installAnywhereAgentsCommand],
  ["augment", installAugmentCommand],
  ["avante", installAvanteCommand],
  ["baz", installBazCommand],
  ["bito", installBitoCommand],
  ["blackbox", installBlackboxCommand],
  ["blocks", installBlocksCommand],
  ["clawdbot", installClawdbotCommand],
  ["bob", installBobCommand],
  ["builder", installBuilderCommand],
  ["charlie", installCharlieCommand],
  ["codex", installCodexCommand],
  ["claude-code", installClaudeCodeCommand],
  ["cline", installClineCommand],
  ["codeant", installCodeantCommand],
  ["codebuff", installCodebuffCommand],
  ["codegen", installCodegenCommand],
  ["coder-agents", installCoderAgentsCommand],
  ["coderagents", installCoderAgentsCommand],
  ["codebuddy", installCodebuddyCommand],
  ["command-code", installCommandCodeCommand],
  ["commandcode", installCommandCodeCommand],
  ["continue", installContinueCommand],
  ["copilot-agent", installCopilotAgentCommand],
  ["crush", installCrushCommand],
  ["cursor", installCursorCommand],
  ["deepagents", installDeepagentsCommand],
  ["devin", installDevinCommand],
  ["dot-agents", installDotAgentsCommand],
  ["docker-agent", installDockerAgentCommand],
  ["dockeragent", installDockerAgentCommand],
  ["cagent", installDockerAgentCommand],
  ["eca", installEcaCommand],
  ["elyra", installElyraCommand],
  ["firebase-studio", installFirebaseStudioCommand],
  ["forgecode", installForgecodeCommand],
  ["forge-code", installForgecodeCommand],
  ["gemini-cli", installGeminiCliCommand],
  ["gitlab-duo", installGitlabDuoCommand],
  ["grok-cli", installGrokCliCommand],
  ["gptme", installGptmeCommand],
  ["jean2", installJean2Command],
  ["grok-build", installGrokBuildCommand],
  ["grok-bot", installGrokBotCommand],
  ["grokbot", installGrokBotCommand],
  ["goose", installGooseCommand],
  ["greptile", installGreptileCommand],
  ["qodo", installQodoCommand],
  ["coderabbit", installCoderabbitCommand],
  ["jetbrains-ai", installJetbrainsAiCommand],
  ["junie", installJunieCommand],
  ["jules", installJulesCommand],
  ["leanctl", installLeanctlCommand],
  ["kimi", installKimiCommand],
  ["localcode", installLocalcodeCommand],
  ["local-code", installLocalcodeCommand],
  ["kiro", installKiroCommand],
  ["kilo", installKiloCommand],
  ["mcp-agent", installMcpAgentCommand],
  ["mcpagent", installMcpAgentCommand],
  ["mistral-vibe", installMistralVibeCommand],
  ["mistralvibe", installMistralVibeCommand],
  ["mini-swe-agent", installMiniSweAgentCommand],
  ["mini-sweagent", installMiniSweAgentCommand],
  ["swe-agent", installSweAgentCommand],
  ["sweagent", installSweAgentCommand],
  ["stagewise", installStagewiseCommand],
  ["mux", installMuxCommand],
  ["novakit", installNovakitCommand],
  ["knowns", installKnownsCommand],
  ["ona", installOnaCommand],
  ["warp", installWarpCommand],
  ["openhands", installOpenhandsCommand],
  ["open-interpreter", installOpenInterpreterCommand],
  ["openinterpreter", installOpenInterpreterCommand],
  ["openwebui", installOpenwebuiCommand],
  ["plandex", installPlandexCommand],
  ["qoder", installQoderCommand],
  ["replit", installReplitCommand],
  ["replit-agent", installReplitCommand],
  ["qwen-code", installQwenCodeCommand],
  ["pi", installPiCommand],
  ["pi-go", installPiGoCommand],
  ["pigo", installPiGoCommand],
  ["opencode", installOpencodeCommand],
  ["roo", installRooCommand],
  ["rovo", installRovoCommand],
  ["rovo-dev", installRovoCommand],
  ["ruler", installRulerCommand],
  ["tabnine", installTabnineCommand],
  ["tabby", installTabbyCommand],
  ["trae", installTraeCommand],
  ["uipath", installUipathCommand],
  ["vscode-copilot", installVscodeCopilotCommand],
  ["windsurf", installWindsurfCommand],
  ["copilot-cli", installCopilotCliCommand],
  ["droid", installDroidCommand],
  ["zed", installZedCommand],
  ["zencoder", installZencoderCommand],
]);
