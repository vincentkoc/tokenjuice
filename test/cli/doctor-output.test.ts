import { describe, expect, it } from "vitest";

import { formatHookDoctorReport } from "../../src/cli/doctor-output.js";
import type { HookDoctorReport } from "../../src/index.js";

function disabledReport(path: string): {
  hooksPath: string;
  status: "disabled";
  issues: string[];
  missingPaths: string[];
  fixCommand: string;
} {
  return {
    hooksPath: path,
    status: "disabled",
    issues: ["tokenjuice hook is not installed"],
    missingPaths: [],
    fixCommand: "tokenjuice install codex",
  };
}

describe("formatHookDoctorReport", () => {
  it("omits disabled integrations from text output", () => {
    const report = {
      status: "ok",
      integrations: {
        codex: disabledReport("/tmp/codex/hooks.json"),
        "claude-code": {
          settingsPath: "/tmp/claude/settings.json",
          status: "ok",
          expectedCommand: "tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice",
          detectedCommand: "tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice",
          issues: [],
          missingPaths: [],
          fixCommand: "tokenjuice install claude-code",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toBe([
      "hook health: ok",
      "claude-code:",
      "- path: /tmp/claude/settings.json",
      "- health: ok",
      "- expected command: tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice",
      "- configured command: tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice",
      "- repair: tokenjuice install claude-code",
      "",
      "available integrations: adal, aether, aictl, ai-memory-protocol, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, baz, bob, builder, codex, claude-code, cline, codebuff, codegen, coder-agents, coderabbit, codebuddy, command-code, continue, copilot-agent, crush, cursor, deepagents, devin, dot-agents, docker-agent, droid, eca, elyra, firebase-studio, forgecode, gemini-cli, gitlab-duo, goose, greptile, grok-build, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, leanctl, kimi, kiro, kilo, knowns, localcode, mcp-agent, mini-swe-agent, swe-agent, mistral-vibe, mux, novakit, ona, openhands, open-interpreter, openwebui, pi, pi-go, plandex, qodo, qoder, qwen-code, replit, roo, rovo, ruler, tabby, tabnine, trae, uipath, vscode-copilot, warp, windsurf, zed, zencoder, copilot-cli",
      "enable another integration: tokenjuice install <host>",
      "",
    ].join("\n"));
  });

  it("prints a compact empty state when no hooks are installed", () => {
    const report = {
      status: "disabled",
      integrations: {
        codex: disabledReport("/tmp/codex/hooks.json"),
        "claude-code": {
          settingsPath: "/tmp/claude/settings.json",
          status: "disabled",
          issues: ["tokenjuice hook is not installed"],
          missingPaths: [],
          fixCommand: "tokenjuice install claude-code",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toBe([
      "hook health: disabled",
      "no tokenjuice hooks installed",
      "",
      "available integrations: adal, aether, aictl, ai-memory-protocol, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, baz, bob, builder, codex, claude-code, cline, codebuff, codegen, coder-agents, coderabbit, codebuddy, command-code, continue, copilot-agent, crush, cursor, deepagents, devin, dot-agents, docker-agent, droid, eca, elyra, firebase-studio, forgecode, gemini-cli, gitlab-duo, goose, greptile, grok-build, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, leanctl, kimi, kiro, kilo, knowns, localcode, mcp-agent, mini-swe-agent, swe-agent, mistral-vibe, mux, novakit, ona, openhands, open-interpreter, openwebui, pi, pi-go, plandex, qodo, qoder, qwen-code, replit, roo, rovo, ruler, tabby, tabnine, trae, uipath, vscode-copilot, warp, windsurf, zed, zencoder, copilot-cli",
      "enable another integration: tokenjuice install <host>",
      "",
    ].join("\n"));
  });

  it("prefers rule paths over config paths for integrations that expose both", () => {
    const report = {
      status: "ok",
      integrations: {
        kilo: {
          rulePath: "/tmp/project/.kilo/rules/tokenjuice.md",
          configPath: "/tmp/project/kilo.jsonc",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install kilo",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toContain("- path: /tmp/project/.kilo/rules/tokenjuice.md");
    expect(formatHookDoctorReport(report)).not.toContain("- path: /tmp/project/kilo.jsonc");
  });

  it("prints skill paths for skill-backed integrations", () => {
    const report = {
      status: "ok",
      integrations: {
        crush: {
          skillPath: "/tmp/project/.crush/skills/tokenjuice/SKILL.md",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install crush",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toContain("- path: /tmp/project/.crush/skills/tokenjuice/SKILL.md");
  });

  it("prints sync commands for source-sync integrations", () => {
    const report = {
      status: "ok",
      integrations: {
        agentlink: {
          instructionsPath: "/tmp/project/AGENTS.md",
          syncCommand: "agentlink sync",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install agentlink",
        },
        agentinit: {
          instructionsPath: "/tmp/project/AGENTS.md",
          syncCommand: "agentinit sync",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install agentinit",
        },
        "agents-cli": {
          instructionsPath: "/tmp/agents/memory/AGENTS.md",
          syncCommand: "agents sync",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install agents-cli",
        },
        "anywhere-agents": {
          instructionsPath: "/tmp/project/AGENTS.local.md",
          syncCommand: "anywhere-agents",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install anywhere-agents",
        },
        "dot-agents": {
          rulePath: "/tmp/agents/rules/global/rules.mdc",
          syncCommand: "dot-agents sync",
          status: "ok",
          issues: [],
          advisories: [],
          missingPaths: [],
          fixCommand: "tokenjuice install dot-agents",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toContain("- sync: agentlink sync");
    expect(formatHookDoctorReport(report)).toContain("- sync: agentinit sync");
    expect(formatHookDoctorReport(report)).toContain("- sync: agents sync");
    expect(formatHookDoctorReport(report)).toContain("- sync: anywhere-agents");
    expect(formatHookDoctorReport(report)).toContain("- sync: dot-agents sync");
  });
});
