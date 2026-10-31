import type { WriteInstructionFileResult } from "../hosts/shared/instruction-file.js";
import { installOpenCodeV2Extension } from "../hosts/opencode/v2/index.js";
import { installQoderHook } from "../hosts/qoder/hook-install.js";
import { installQwenWorkSkill } from "../hosts/qwenwork/index.js";
import { installQoderWorkSkill } from "../hosts/qoderwork/index.js";
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
import { installAnteInstructions } from "../hosts/ante/index.js";
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
import { createHostCommand } from "./host-command.js";
import type { HostCommandHandler } from "./command-types.js";

function formatPlandexLoadCommand(conventionPath: string): string {
  const loadPath = relative(process.cwd(), conventionPath) || "PLANDEX.tokenjuice.md";
  return `plandex load ${shellQuote(loadPath)}`;
}

function createFileInstallCommand<PathKey extends string>(
  run: () => Promise<WriteInstructionFileResult<PathKey>>,
  options: {
    target: string;
    noun: string;
    pathLabel: string;
    pathKey: PathKey;
    beta: string;
  },
): HostCommandHandler {
  return createHostCommand(run, (result) => {
    const details = [
      { label: options.pathLabel, value: result[options.pathKey] },
      { label: "Beta", value: options.beta },
      { label: "Verify", value: `tokenjuice doctor ${options.target}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess(options.target, options.noun, details));
  });
}

const installAdalCommand = createFileInstallCommand(() => installAdalInstructions(), {
  target: "adal",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; AdaL CLI still owns command execution",
});

const installAetherCommand = createHostCommand(() => installAetherPrompt(), (result) => {
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
});

const installAiderCommand = createHostCommand(() => installAiderConvention(), (result) => {
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
});

const installAictlCommand = createFileInstallCommand(() => installAictlInstructions(), {
  target: "aictl",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "AICTL.md project prompt guidance; aictl still owns command execution",
});

const installAiMemoryProtocolCommand = createHostCommand(() => installAiMemoryProtocolMemory(), (result) => {
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
});

const installAgentLayerCommand = createHostCommand(() => installAgentLayerInstructions(), (result) => {
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
});

const installAgentinitCommand = createHostCommand(() => installAgentInitInstructions(), (result) => {
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
});

const installAgentlinkCommand = createHostCommand(() => installAgentlinkInstructions(), (result) => {
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
});

const installAgentloomCommand = createHostCommand(() => installAgentloomRule(), (result) => {
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
});

const installAgentsCliCommand = createHostCommand(() => installAgentsCliMemory(), (result) => {
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
});

const installAgentsMdCommand = createFileInstallCommand(() => installAgentsMdInstructions(), {
  target: "agents-md",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "generic AGENTS.md guidance; the active agent still owns command execution",
});

const installAgentsgeCommand = createHostCommand(() => installAgentsGeRule(), (result) => {
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
});

const installAgentsmeshCommand = createHostCommand(() => installAgentsMeshRule(), (result) => {
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
});

const installAmazonQCommand = createHostCommand(() => installAmazonQRule(), (result) => {
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
});

const installAmpCommand = createHostCommand(() => installAmpInstructions(), (result) => {
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
});

const installAntigravityCommand = createHostCommand(() => installAntigravityRule(), (result) => {
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
});

const installAnywhereAgentsCommand = createHostCommand(() => installAnywhereAgentsInstructions(), (result) => {
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
});

const installAugmentCommand = createHostCommand(() => installAugmentRule(), (result) => {
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
});

const installAvanteCommand = createFileInstallCommand(() => installAvanteInstructions(), {
  target: "avante",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Avante still owns command execution",
});

const installBazCommand = createHostCommand(() => installBazSkill(), (result) => {
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
});

const installBitoCommand = createHostCommand(() => installBitoGuidelines(), (result) => {
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
});

const installBlackboxCommand = createHostCommand(() => installBlackboxSkill(), (result) => {
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
});

const installBlocksCommand = createHostCommand(() => installBlocksSkill(), (result) => {
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
});

const installClawdbotCommand = createHostCommand(() => installClawdbotSkill(), (result) => {
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
});

const installBobCommand = createFileInstallCommand(() => installBobInstructions(), {
  target: "bob",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; IBM Bob still owns command execution",
});

const installBuilderCommand = createHostCommand(() => installBuilderRule(), (result) => {
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
});

const installCharlieCommand = createFileInstallCommand(() => installCharlieInstructions(), {
  target: "charlie",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "AGENTS.md-based guidance; Charlie still owns command execution",
});

const installCodexCommand = createHostCommand((args) => installCodexHook(undefined, {
    local: args.local,
    ...(args.noOmit ? { noOmit: true } : {}),
  }), (result, args) => {
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
});

const installClaudeCodeCommand = createHostCommand((args) => installClaudeCodeHook(undefined, { local: args.local }), (result, args) => {
  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
  process.stdout.write(formatInstallSuccess("claude-code", "hook", details));
});

const installClineCommand = createHostCommand((args) => installClineHook(undefined, { local: args.local }), (result, args) => {
  const details = [
    { label: "Hook", value: result.hookPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "PreToolUse wrapping; restart Cline after install" },
    { label: "Verify", value: `tokenjuice doctor cline${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  process.stdout.write(formatInstallSuccess("cline", "hook", details));
});

const installCodeantCommand = createFileInstallCommand(() => installCodeAntInstructions(), {
  target: "codeant",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instructions-based guidance; CodeAnt still owns review and fixes",
});

const installCodebuffCommand = createFileInstallCommand(() => installCodebuffInstructions(), {
  target: "codebuff",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Codebuff still owns command execution",
});

const installCodegenCommand = createFileInstallCommand(() => installCodegenInstructions(), {
  target: "codegen",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "rule-file guidance; Codegen still owns command execution",
});

const installCoderAgentsCommand = createHostCommand(() => installCoderAgentsSkill(), (result) => {
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
});

const installCodebuddyCommand = createHostCommand((args) => installCodeBuddyHook(undefined, { local: args.local }), (result, args) => {
  process.stdout.write(formatCodeBuddyInstallSuccess({ ...result, local: args.local }));
});

const installCommandCodeCommand: HostCommandHandler = async (args) => {
  await installCommandCodeHook(undefined, { local: args.local });
  return 0;
};

const installContinueCommand = createHostCommand(() => installContinueRule(), (result) => {
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
});

const installCopilotAgentCommand = createHostCommand((args) => installCopilotAgentHook(undefined, { local: args.local }), (result, args) => {
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
});

const installCrushCommand = createHostCommand(() => installCrushSkill(), (result) => {
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
});

const installCursorCommand = createHostCommand((args) => installCursorHook(undefined, { local: args.local }), (result, args) => {
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
});

const installDeepagentsCommand = createFileInstallCommand(() => installDeepAgentsInstructions(), {
  target: "deepagents",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Deep Agents Code still owns command execution",
});

const installDevinCommand = createHostCommand((args) => installDevinHook(undefined, { local: args.local }), (result, args) => {
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
});

const installDotAgentsCommand = createHostCommand(() => installDotAgentsRule(), (result) => {
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
});

const installDockerAgentCommand = createHostCommand(() => installDockerAgentPrompt(), (result) => {
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
});

const installEcaCommand = createHostCommand(() => installEcaSkill(), (result) => {
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
});

const installElyraCommand = createHostCommand(() => installElyraSkill(), (result) => {
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
});

const installFirebaseStudioCommand = createHostCommand(() => installFirebaseStudioRule(), (result) => {
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
});

const installForgecodeCommand = createFileInstallCommand(() => installForgeCodeInstructions(), {
  target: "forgecode",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "ForgeCode AGENTS.md guidance; ForgeCode still owns command execution",
});

const installGeminiCliCommand = createHostCommand((args) => installGeminiCliHook(undefined, { local: args.local }), (result, args) => {
  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "BeforeTool wrapping; Gemini CLI retains permission policy" },
    { label: "Verify", value: `tokenjuice doctor gemini-cli${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("gemini-cli", "hook", details));
});

const installGitlabDuoCommand = createHostCommand(() => installGitLabDuoRule(), (result) => {
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
});

const installGrokCliCommand = createHostCommand((args) => installGrokCliHook(undefined, { local: args.local }), (result, args) => {
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
});

const installGptmeCommand = createFileInstallCommand(() => installGptmeInstructions(), {
  target: "gptme",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; gptme still owns command execution",
});

const installJean2Command = createFileInstallCommand(() => installJean2Instructions(), {
  target: "jean2",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-file guidance; Jean2 still owns command execution",
});

const installGrokBuildCommand = createFileInstallCommand(() => installGrokBuildInstructions(), {
  target: "grok-build",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Grok Build still owns command execution",
});

const installGrokBotCommand = createHostCommand(() => installGrokBotRule(), (result) => {
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
});

const installGooseCommand = createHostCommand(() => installGooseHints(), (result) => {
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
});

const installGreptileCommand = createHostCommand(() => installGreptileRule(), (result) => {
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
});

const installQodoCommand = createHostCommand(() => installQodoReviewConfig(), (result) => {
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
});

const installCoderabbitCommand = createHostCommand(() => installCodeRabbitConfig(), (result) => {
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
});

const installJetbrainsAiCommand = createHostCommand(() => installJetBrainsAiRule(), (result) => {
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
});

const installJunieCommand = createFileInstallCommand(() => installJunieInstructions(), {
  target: "junie",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Junie still owns command execution",
});

const installJulesCommand = createFileInstallCommand(() => installJulesInstructions(), {
  target: "jules",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Jules still owns command execution",
});

const installLeanctlCommand = createFileInstallCommand(() => installLeanCtlInstructions(), {
  target: "leanctl",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "project instruction guidance; LeanCTL still owns command execution",
});

const installKimiCommand = createHostCommand((args) => installKimiHook(undefined, { local: args.local }), (result, args) => {
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
});

const installLocalcodeCommand = createHostCommand(() => installLocalCodePlugin(), (result) => {
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
});

const installKiroCommand = createHostCommand(() => installKiroSteering(), (result) => {
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
});

const installKiloCommand = createHostCommand(() => installKiloRule(), (result) => {
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
});

const installMcpAgentCommand = createHostCommand(() => installMcpAgentDefinition(), (result) => {
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
});

const installMistralVibeCommand = createFileInstallCommand(() => installMistralVibeInstructions(), {
  target: "mistral-vibe",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Mistral Vibe still owns command execution",
});

const installMiniSweAgentCommand = createHostCommand(() => installMiniSweAgentConfig(), (result) => {
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
});

const installSweAgentCommand = createHostCommand(() => installSweAgentConfig(), (result) => {
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
});

const installStagewiseCommand = createHostCommand(() => installStagewiseSkill(), (result) => {
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
});

const installMuxCommand = createHostCommand((args) => installMuxHook(undefined, { local: args.local }), (result, args) => {
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
});

const installNovakitCommand = createFileInstallCommand(() => installNovaKitInstructions(), {
  target: "novakit",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "NOVAKIT.md guidance; NovaKit still owns command execution",
});

const installKnownsCommand = createFileInstallCommand(() => installKnownsInstructions(), {
  target: "knowns",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "KNOWNS.md guidance; Knowns still owns MCP/project memory",
});

const installOnaCommand = createHostCommand(() => installOnaSkill(), (result) => {
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
});

const installWarpCommand = createFileInstallCommand(() => installWarpInstructions(), {
  target: "warp",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Warp still owns command execution",
});

const installOpenhandsCommand: HostCommandHandler = async (args) => {
  await installOpenHandsHook(undefined, { local: args.local });
  return 0;
};

const installOpenInterpreterCommand = createFileInstallCommand(() => installOpenInterpreterInstructions(), {
  target: "open-interpreter",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Open Interpreter still owns command execution",
});

const installOpenwebuiCommand = createHostCommand(() => installOpenWebUITool(), (result) => {
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
});

const installPlandexCommand = createHostCommand(() => installPlandexConvention(), (result) => {
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
});

const installAnteCommand = createFileInstallCommand(() => installAnteInstructions(), {
  target: "ante",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Ante still owns command execution",
});

const installQoderCommand = createFileInstallCommand(() => installQoderInstructions(), {
  target: "qoder",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Qoder still owns command execution",
});

const installReplitCommand = createFileInstallCommand(() => installReplitInstructions(), {
  target: "replit",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Replit Agent still owns command execution",
});

const installQoderCliCommand = createHostCommand((args) => installQoderHook(undefined, { local: args.local }), (result, args) => {
  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "synchronous Bash output replacement; verify live Qoder CLI behavior" },
    { label: "Verify", value: `tokenjuice doctor qoder-cli${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("qoder-cli", "hook", details));
});

const installQoderWorkCommand = createHostCommand(() => installQoderWorkSkill(), (result) => {
  process.stdout.write(formatInstallSuccess("qoderwork", "skill", [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "guidance skill; verify discovery and execution inside QoderWork" },
    { label: "Verify", value: "tokenjuice doctor qoderwork" },
    ...(result.backupPath ? [{ label: "Backup", value: result.backupPath }] : []),
  ]));
});

const installQwenWorkCommand = createHostCommand(() => installQwenWorkSkill(), (result) => {
  process.stdout.write(formatInstallSuccess("qwenwork", "skill", [
    { label: "Skill", value: result.skillPath },
    { label: "Beta", value: "guidance skill; verify discovery and execution inside QwenWork" },
    { label: "Verify", value: "tokenjuice doctor qwenwork" },
    ...(result.backupPath ? [{ label: "Backup", value: result.backupPath }] : []),
  ]));
});

const installQwenCodeCommand = createHostCommand((args) => installQwenCodeHook(undefined, { local: args.local }), (result, args) => {
  const details = [
    { label: "Hook", value: result.settingsPath },
    { label: "Command", value: result.command },
    { label: "Beta", value: "project-local PreToolUse wrapping; Qwen Code retains permission policy" },
    { label: "Verify", value: `tokenjuice doctor qwen-code${args.local ? " --local" : ""}` },
    { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  process.stdout.write(formatInstallSuccess("qwen-code", "hook", details));
});

const installPiCommand = createHostCommand((args) => installPiExtension(undefined, {
    local: args.local,
    skipCommandNames: args.skipCommandNames,
  }), (result, args) => {
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
});

const installPiGoCommand = createHostCommand(() => installPiGoSkill(), (result) => {
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
});

const installOpencodeV2Command = createHostCommand((args) => installOpenCodeV2Extension({ local: args.local }), (result) => {
  process.stdout.write(formatInstallSuccess("opencode-v2", "extension", [
    { label: "Extension", value: result.extensionPath },
    { label: "Verify", value: "tokenjuice doctor opencode-v2" },
    { label: "Beta", value: "V2 shell output replacement; verify loading in a fresh session" },
    ...(result.backupPath ? [{ label: "Backup", value: result.backupPath }] : []),
  ]));
});

const installOpencodeCommand = createHostCommand((args) => installOpenCodeExtension(undefined, { local: args.local }), (result) => {
  const details = [
    { label: "Extension", value: result.extensionPath },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  details.push({ label: "Reload", value: "restart opencode (the plugin is auto-loaded on session start)" });
  details.push({ label: "Verify", value: "tokenjuice doctor opencode" });
  process.stdout.write(formatInstallSuccess("opencode", "extension", details));
});

const installRooCommand = createHostCommand(() => installRooInstructions(), (result) => {
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
});

const installRovoCommand = createFileInstallCommand(() => installRovoInstructions(), {
  target: "rovo",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Rovo Dev CLI still owns command execution",
});

const installRulerCommand = createHostCommand(() => installRulerRule(), (result) => {
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
});

const installTabnineCommand = createFileInstallCommand(() => installTabnineInstructions(), {
  target: "tabnine",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-based guidance; Tabnine CLI still owns command execution",
});

const installTabbyCommand = createHostCommand(() => installTabbySystemPrompt(), (result) => {
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
});

const installTraeCommand = createHostCommand(() => installTraeRule(), (result) => {
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
});

const installUipathCommand = createFileInstallCommand(() => installUiPathInstructions(), {
  target: "uipath",
  noun: "instructions",
  pathLabel: "Instructions",
  pathKey: "instructionsPath",
  beta: "instruction-file guidance; the active coding agent still owns command execution",
});

const installVscodeCopilotCommand = createHostCommand((args) => installVscodeCopilotHook(undefined, { local: args.local }), (result, args) => {
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
});

const installWindsurfCommand = createHostCommand(() => installWindsurfRule(), (result) => {
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
});

const installCopilotCliCommand = createHostCommand((args) => installCopilotCliHook(undefined, { local: args.local }), (result, args) => {
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
});

const installDroidCommand = createHostCommand((args) => installDroidHook(undefined, { local: args.local }), (result, args) => {
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
});

const installZedCommand = createHostCommand(() => installZedInstructions(), (result) => {
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
});

const installZencoderCommand = createHostCommand(() => installZencoderRule(), (result) => {
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
});

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
  ["ante", installAnteCommand],
  ["qoder", installQoderCommand],
  ["qoder-cli", installQoderCliCommand],
  ["replit", installReplitCommand],
  ["replit-agent", installReplitCommand],
  ["qwen-code", installQwenCodeCommand],
  ["qwenwork", installQwenWorkCommand],
  ["qoderwork", installQoderWorkCommand],
  ["pi", installPiCommand],
  ["pi-go", installPiGoCommand],
  ["pigo", installPiGoCommand],
  ["opencode", installOpencodeCommand],
  ["opencode-v2", installOpencodeV2Command],
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
