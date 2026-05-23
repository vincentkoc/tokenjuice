<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

## what is tokenjuice?

tokenjuice is a deterministic output compactor for terminal-heavy agent workflows. agents and harnesses run noisy commands like `git status`, `pnpm test`, `docker build`, `rg`, or `pnpm --help`; tokenjuice keeps the command semantics untouched, observes the output after execution, and returns a smaller payload built from rule-driven reducers instead of dumping the whole wall of terminal text back into context.

the point is leverage: less transcript waste, fewer useless reruns, and cleaner handoff between tools without making the shell magical. raw output stays available only when you explicitly ask for it through `--raw` / `--full` or opt-in artifact storage, rules stay inspectable JSON instead of LLM vibes, and host integrations stay thin wrappers around the same core reducer instead of becoming one-off adapter logic.

## host integrations

supported integrations:

| Logo | Client | Install | Hook file |
| --- | --- | --- | --- |
| <img width="48px" src="docs/client-claude.jpg" alt="Claude" /> | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `tokenjuice install claude-code` | `~/.claude/settings.json` |
| <img width="48px" src="docs/client-codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy](https://codebuddy.tencent.com/) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` |
| <img width="48px" src="docs/client-openai.jpg" alt="Codex" /> | [Codex CLI](https://github.com/openai/codex) | `tokenjuice install codex` | `~/.codex/hooks.json` |
| <img width="48px" src="docs/client-cursor.jpg" alt="Cursor" /> | [Cursor](https://cursor.com/docs/hooks) | `tokenjuice install cursor` | `~/.cursor/hooks.json` |
| <img width="48px" src="docs/client-droid.png" alt="Droid" /> | [Droid (Factory CLI)](https://docs.factory.ai/cli/configuration/hooks-guide) | `tokenjuice install droid` | `~/.factory/settings.json` |
| <img width="48px" src="docs/client-copilot.png" alt="GitHub Copilot CLI" /> | [GitHub Copilot CLI](https://github.com/github/copilot-cli) | `tokenjuice install copilot-cli` | `~/.copilot/hooks/tokenjuice-cli.json` |
| <img width="48px" src="docs/client-openclaw.jpg" alt="OpenClaw" /> | [OpenClaw](https://openclaw.ai/) | `openclaw config set plugins.entries.tokenjuice.enabled true` | `~/.openclaw/openclaw.json` |
| <img width="48px" src="docs/client-opencode.png" alt="OpenCode" /> | [OpenCode](https://opencode.ai/) | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` |
| <img width="48px" src="docs/client-pi.png" alt="pi" /> | [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` |
| <img width="48px" src="docs/client-copilot.png" alt="VS Code Copilot" /> | [VS Code Copilot Chat](https://code.visualstudio.com/docs/copilot/overview) | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` |

beta integrations:

| Logo | Client | Install | Hook file |
| --- | --- | --- | --- |
| <img width="48px" src="docs/client-aider.svg" alt="Aider" /> | [Aider](https://aider.chat/) | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` |
| <img width="48px" src="docs/client-agent-layer.svg" alt="Agent Layer" /> | [Agent Layer](https://agent-layer.dev/docs/) | `tokenjuice install agent-layer` | `.agent-layer/instructions/tokenjuice.md`; run `al sync` after install or uninstall |
| <img width="48px" src="docs/client-agentloom.svg" alt="Agentloom" /> | [Agentloom](https://agentloom.sh/docs) | `tokenjuice install agentloom` | `.agents/rules/tokenjuice-agentloom.md`; run `agentloom sync` after install or uninstall |
| <img width="48px" src="docs/client-agentsge.svg" alt="agents.ge" /> | [agents.ge](https://agents.ge/) | `tokenjuice install agentsge` | `.agents/rules/tokenjuice-agentsge.md` |
| <img width="48px" src="docs/client-agentsmesh.svg" alt="AgentsMesh" /> | [AgentsMesh](https://samplexbro.github.io/agentsmesh/) | `tokenjuice install agentsmesh` | `.agentsmesh/rules/tokenjuice.md`; run `agentsmesh generate` after install or uninstall |
| <img width="48px" src="docs/client-amazon-q.svg" alt="Amazon Q" /> | [Amazon Q Developer CLI / Kiro compatibility](https://kiro.dev/docs/cli/migrating-from-q/) | `tokenjuice install amazon-q` | `.amazonq/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-amp.svg" alt="Amp" /> | [Amp](https://ampcode.com/manual) | `tokenjuice install amp` | `AGENTS.md` / `AGENT.md` / `CLAUDE.md` |
| <img width="48px" src="docs/client-antigravity.svg" alt="Antigravity" /> | [Google Antigravity](https://antigravity.google/) | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-augment.svg" alt="Augment" /> | [Augment](https://docs.augmentcode.com/cli/rules) | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-avante.png" alt="Avante" /> | [Avante.nvim](https://github.com/yetone/avante.nvim) | `tokenjuice install avante` | `avante.md` |
| <img width="48px" src="docs/client-bob.svg" alt="IBM Bob" /> | [IBM Bob Shell](https://bob.ibm.com/docs/shell/configuration/configuring) | `tokenjuice install bob` | `AGENTS.md` |
| <img width="48px" src="docs/client-builder.svg" alt="Builder" /> | [Builder](https://www.builder.io/c/docs/projects-configuration-files) | `tokenjuice install builder` | `.builder/rules/tokenjuice.mdc` |
| <img width="48px" src="docs/client-cline.svg" alt="Cline" /> | [Cline](https://docs.cline.bot/features/hooks/hook-reference) | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` |
| <img width="48px" src="docs/client-codebuff.svg" alt="Codebuff" /> | [Codebuff](https://www.codebuff.com/docs/help/quick-start) | `tokenjuice install codebuff` | `AGENTS.md` |
| <img width="48px" src="docs/client-codegen.svg" alt="Codegen" /> | [Codegen](https://docs.codegen.com/settings/repo-rules) | `tokenjuice install codegen` | `AGENTS.md` |
| <img width="48px" src="docs/client-continue.png" alt="Continue" /> | [Continue](https://docs.continue.dev/) | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-crush.svg" alt="Crush" /> | [Crush](https://github.com/charmbracelet/crush) | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="docs/client-devin.svg" alt="Devin" /> | [Devin for Terminal](https://cli.devin.ai/docs/extensibility/hooks/overview) | `tokenjuice install devin` | `.devin/hooks.v1.json` |
| <img width="48px" src="docs/client-firebase-studio.svg" alt="Firebase Studio" /> | [Firebase Studio](https://firebase.google.com/docs/studio/set-up-gemini) | `tokenjuice install firebase-studio` | `.idx/airules.md` |
| <img width="48px" src="docs/client-gemini.png" alt="Gemini" /> | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` |
| <img width="48px" src="docs/client-gitlab-duo.svg" alt="GitLab Duo" /> | [GitLab Duo Agent Platform](https://docs.gitlab.com/user/duo_agent_platform/customize/custom_rules/) | `tokenjuice install gitlab-duo` | `.gitlab/duo/chat-rules.md` |
| <img width="48px" src="docs/client-goose.svg" alt="Goose" /> | [Goose](https://goose-docs.ai/) | `tokenjuice install goose` | `.goosehints` |
| <img width="48px" src="docs/client-grok-build.svg" alt="Grok Build" /> | [Grok Build](https://docs.x.ai/build/overview) | `tokenjuice install grok-build` | `AGENTS.md` |
| <img width="48px" src="docs/client-grok-cli.svg" alt="Grok CLI" /> | [Grok CLI](https://github.com/superagent-ai/grok-cli) | `tokenjuice install grok-cli` | `~/.grok/user-settings.json` |
| <img width="48px" src="docs/client-gptme.svg" alt="gptme" /> | [gptme](https://gptme.org/docs/prompts.html) | `tokenjuice install gptme` | `AGENTS.md` |
| <img width="48px" src="docs/client-copilot.png" alt="GitHub Copilot coding agent" /> | [GitHub Copilot coding agent](https://docs.github.com/en/copilot/using-github-copilot/coding-agent) | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` |
| <img width="48px" src="docs/client-jean2.svg" alt="Jean2" /> | [Jean2](https://jean2.ai/docs/deep-dive/agents-md) | `tokenjuice install jean2` | `AGENTS.md` |
| <img width="48px" src="docs/client-jetbrains-ai.svg" alt="JetBrains AI Assistant" /> | [JetBrains AI Assistant](https://www.jetbrains.com/help/ai-assistant/) | `tokenjuice install jetbrains-ai` | `.aiassistant/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-junie.svg" alt="Junie" /> | [Junie](https://junie.jetbrains.com/docs/junie-cli-usage.html) | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48px" src="docs/client-jules.svg" alt="Jules" /> | [Jules](https://jules.google/docs/) | `tokenjuice install jules` | `AGENTS.md` |
| <img width="48px" src="docs/client-kimi.svg" alt="Kimi" /> | [Kimi Code CLI](https://moonshotai.github.io/kimi-cli/en/) | `tokenjuice install kimi` | `~/.kimi/config.toml` |
| <img width="48px" src="docs/client-kiro.svg" alt="Kiro" /> | [Kiro](https://kiro.dev/) | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` |
| <img width="48px" src="docs/client-kilo.svg" alt="Kilo Code" /> | [Kilo Code](https://kilocode.ai/) | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-mistral-vibe.svg" alt="Mistral Vibe" /> | [Mistral Vibe](https://docs.mistral.ai/mistral-vibe/agents-skills) | `tokenjuice install mistral-vibe` | `AGENTS.md` |
| <img width="48px" src="docs/client-mux.svg" alt="Mux" /> | [Mux](https://mux.coder.com/hooks/tools) | `tokenjuice install mux` | `.mux/tool_post` |
| <img width="48px" src="docs/client-ona.svg" alt="Ona" /> | [Ona Agent](https://ona.com/docs/ona/agents/overview) | `tokenjuice install ona` | `AGENTS.md` |
| <img width="48px" src="docs/client-openhands.svg" alt="OpenHands" /> | [OpenHands](https://docs.openhands.dev/) | `tokenjuice install openhands` | `.openhands/hooks.json` |
| <img width="48px" src="docs/client-open-interpreter.svg" alt="Open Interpreter" /> | [Open Interpreter](https://www.openinterpreter.com/docs/terminal/agents_md) | `tokenjuice install open-interpreter` | `AGENTS.md` |
| <img width="48px" src="docs/client-openwebui.svg" alt="Open WebUI" /> | [Open WebUI](https://openwebui.com/) | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py` |
| <img width="48px" src="docs/client-plandex.svg" alt="Plandex" /> | [Plandex](https://docs.plandex.ai/) | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` |
| <img width="48px" src="docs/client-qoder.svg" alt="Qoder" /> | [Qoder CLI](https://docs.qoder.com/cli/using-cli) | `tokenjuice install qoder` | `AGENTS.md` |
| <img width="48px" src="docs/client-qwen-code.svg" alt="Qwen Code" /> | [Qwen Code](https://qwenlm.github.io/qwen-code-docs/) | `tokenjuice install qwen-code` | `.qwen/settings.json` |
| <img width="48px" src="docs/client-replit.svg" alt="Replit" /> | [Replit Agent](https://docs.replit.com/references/project-setup/replit-dot-md) | `tokenjuice install replit` | `replit.md` |
| <img width="48px" src="docs/client-roo.svg" alt="Roo Code" /> | [Roo Code](https://roocode.com/) | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-rovo.svg" alt="Rovo" /> | [Rovo Dev CLI](https://support.atlassian.com/rovo/docs/use-memory-in-rovo-dev-cli/) | `tokenjuice install rovo` | `AGENTS.md` |
| <img width="48px" src="docs/client-ruler.svg" alt="Ruler" /> | [Ruler](https://github.com/intellectronica/ruler) | `tokenjuice install ruler` | `.ruler/tokenjuice.md` |
| <img width="48px" src="docs/client-tabnine.svg" alt="Tabnine" /> | [Tabnine CLI](https://docs.tabnine.com/main/getting-started/tabnine-cli/features/cli-commands) | `tokenjuice install tabnine` | `TABNINE.md` |
| <img width="48px" src="docs/client-trae.svg" alt="Trae" /> | [Trae](https://traeide.com/) | `tokenjuice install trae` | `.trae/rules/project_rules.md` |
| <img width="48px" src="docs/client-uipath.svg" alt="UiPath" /> | [UiPath for Coding Agents](https://www.uipath.com/developers/coding-agents) | `tokenjuice install uipath` | `AGENTS.md` |
| <img width="48px" src="docs/client-warp.svg" alt="Warp" /> | [Warp](https://docs.warp.dev/agent-platform/capabilities/rules) | `tokenjuice install warp` | `AGENTS.md` / `WARP.md` |
| <img width="48px" src="docs/client-windsurf.svg" alt="Windsurf" /> | [Windsurf](https://windsurf.com/) | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-zed.svg" alt="Zed" /> | [Zed](https://zed.dev/docs/ai/rules.html) | `tokenjuice install zed` | `.rules` |
| <img width="48px" src="docs/client-zencoder.svg" alt="Zencoder" /> | [Zencoder](https://docs.zencoder.ai/rules-context/zen-rules) | `tokenjuice install zencoder` | `.zencoder/rules/tokenjuice.md` |

## install

```bash
npm install -g tokenjuice
# or
pnpm add -g tokenjuice
# or
yarn global add tokenjuice
# or
brew tap vincentkoc/tap
brew install tokenjuice
```

then:

```bash
tokenjuice --help
tokenjuice --version
tokenjuice install [aider|agent-layer|agentloom|agentsge|agentsmesh|amazon-q|amp|antigravity|augment|avante|bob|builder|codex|claude-code|cline|codebuff|codegen|codebuddy|continue|copilot-agent|crush|cursor|devin|droid|firebase-studio|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|copilot-cli|zed|zencoder]
tokenjuice uninstall [aider|agent-layer|agentloom|agentsge|agentsmesh|amazon-q|amp|antigravity|augment|avante|bob|builder|codex|cline|codebuff|codegen|continue|copilot-agent|crush|devin|droid|firebase-studio|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|copilot-cli|zed|zencoder]
```

OpenClaw support is bundled on the OpenClaw side. Do not run
`tokenjuice install openclaw`; enable the bundled plugin instead:

```bash
openclaw config set plugins.entries.tokenjuice.enabled true
```

this requires OpenClaw `2026.4.22` or newer.

## commands

```bash
tokenjuice --help
tokenjuice --version
tokenjuice reduce [file]
tokenjuice reduce-json [file]
tokenjuice wrap -- <command> [args...]
tokenjuice wrap --raw -- <command> [args...]
tokenjuice wrap --store -- <command> [args...]
tokenjuice install [aider|agent-layer|agentloom|agentsge|agentsmesh|amazon-q|amp|antigravity|augment|avante|bob|builder|codex|claude-code|cline|codebuff|codegen|codebuddy|continue|copilot-agent|crush|cursor|devin|droid|firebase-studio|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|copilot-cli|zed|zencoder]
tokenjuice install [aider|agent-layer|agentloom|agentsge|agentsmesh|amazon-q|amp|antigravity|augment|avante|bob|builder|codex|claude-code|cline|codebuff|codegen|codebuddy|continue|copilot-agent|crush|cursor|devin|droid|firebase-studio|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|copilot-cli|zed|zencoder] --local
tokenjuice uninstall [aider|agent-layer|agentloom|agentsge|agentsmesh|amazon-q|amp|antigravity|augment|avante|bob|builder|codex|cline|codebuff|codegen|continue|copilot-agent|crush|devin|droid|firebase-studio|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|copilot-cli|zed|zencoder]
tokenjuice ls
tokenjuice cat <artifact-id>
tokenjuice verify
tokenjuice discover
tokenjuice doctor
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice doctor opencode
tokenjuice stats
tokenjuice stats --timezone utc
```

## overview

tokenjuice has three surfaces. `reduce` compacts text that already exists, `wrap` runs a command and compacts the observed output, and `reduce-json` gives host adapters a stable machine protocol. host integrations are intentionally thin: they install a hook, extension, rule, or guidance file; call the shared compactor; and return compacted context through the host's native surface. use `tokenjuice doctor hooks` to check installed wiring, `tokenjuice doctor <host>` for one integration, and `tokenjuice install <host> --local` when validating the current repo build before release.

the reduction engine is rule-driven. built-in JSON rules live in `src/rules`, user overrides live in `~/.config/tokenjuice/rules`, and project overrides live in `.tokenjuice/rules`; later layers override earlier ones by rule id. rules classify command output, normalize lines, keep or drop patterns, count facts, and retain deterministic head/tail slices. host adapters also apply a narrow safe-inventory policy: exact file-content reads stay raw, standalone repository inventory commands can compact, and unsafe mixed command sequences stay raw.

when a reducer gets it wrong or the task needs untouched bytes, use the explicit bypass:

```bash
tokenjuice wrap --raw -- pnpm --help
tokenjuice wrap --full -- git status
```

useful maintenance commands:

```bash
tokenjuice verify --fixtures
tokenjuice discover
tokenjuice doctor hooks
tokenjuice stats --timezone utc
```

## adapter JSON

`reduce-json` is the machine-facing adapter command. it reads JSON from stdin or a file and always writes JSON to stdout; see the [spec](docs/spec.md) for envelope options and adapter behavior.

direct payload:

```json
{
  "toolName": "exec",
  "command": "pnpm test",
  "argv": ["pnpm", "test"],
  "combinedText": "RUN  v3.2.4 /repo\n...",
  "exitCode": 1
}
```

## docs

- [spec](docs/spec.md)
- [rules](docs/rules.md)
- [integration playbook](docs/integration-playbook.md)
- [Agent Layer integration](docs/agent-layer-integration.md)
- [Agentloom integration](docs/agentloom-integration.md)
- [agents.ge integration](docs/agentsge-integration.md)
- [AgentsMesh integration](docs/agentsmesh-integration.md)
- [Amp integration](docs/amp-integration.md)
- [Amazon Q integration](docs/amazon-q-integration.md)
- [Antigravity integration](docs/antigravity-integration.md)
- [Augment integration](docs/augment-integration.md)
- [IBM Bob integration](docs/bob-integration.md)
- [Builder integration](docs/builder-integration.md)
- [GitHub Copilot coding agent integration](docs/copilot-agent-integration.md)
- [Codebuff integration](docs/codebuff-integration.md)
- [Codegen integration](docs/codegen-integration.md)
- [Crush integration](docs/crush-integration.md)
- [Cursor integration](docs/cursor-integration.md)
- [CodeBuddy integration](docs/codebuddy-integration.md)
- [Devin integration](docs/devin-integration.md)
- [Goose integration](docs/goose-integration.md)
- [Grok Build integration](docs/grok-build-integration.md)
- [Grok CLI integration](docs/grok-cli-integration.md)
- [gptme integration](docs/gptme-integration.md)
- [Jean2 integration](docs/jean2-integration.md)
- [JetBrains AI Assistant integration](docs/jetbrains-ai-integration.md)
- [Kimi integration](docs/kimi-integration.md)
- [Kiro integration](docs/kiro-integration.md)
- [Kilo Code integration](docs/kilo-integration.md)
- [Mistral Vibe integration](docs/mistral-vibe-integration.md)
- [Mux integration](docs/mux-integration.md)
- [Ona integration](docs/ona-integration.md)
- [Open Interpreter integration](docs/open-interpreter-integration.md)
- [Open WebUI integration](docs/openwebui-integration.md)
- [Plandex integration](docs/plandex-integration.md)
- [Qoder integration](docs/qoder-integration.md)
- [Qwen Code integration](docs/qwen-code-integration.md)
- [Replit integration](docs/replit-integration.md)
- [Roo Code integration](docs/roo-integration.md)
- [Rovo integration](docs/rovo-integration.md)
- [Ruler integration](docs/ruler-integration.md)
- [Tabnine integration](docs/tabnine-integration.md)
- [Trae integration](docs/trae-integration.md)
- [UiPath integration](docs/uipath-integration.md)
- [Warp integration](docs/warp-integration.md)
- [Windsurf integration](docs/windsurf-integration.md)
- [Zencoder integration](docs/zencoder-integration.md)
- [security](SECURITY.md)

## status

usable foundation for token reduction with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
