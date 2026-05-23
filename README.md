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
| <img width="48px" src="docs/client-amp.svg" alt="Amp" /> | [Amp](https://ampcode.com/manual) | `tokenjuice install amp` | `AGENTS.md` / `AGENT.md` / `CLAUDE.md` |
| <img width="48px" src="docs/client-antigravity.svg" alt="Antigravity" /> | [Google Antigravity](https://antigravity.google/) | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-augment.svg" alt="Augment" /> | [Augment](https://docs.augmentcode.com/cli/rules) | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-avante.png" alt="Avante" /> | [Avante.nvim](https://github.com/yetone/avante.nvim) | `tokenjuice install avante` | `avante.md` |
| <img width="48px" src="docs/client-cline.svg" alt="Cline" /> | [Cline](https://docs.cline.bot/features/hooks/hook-reference) | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` |
| <img width="48px" src="docs/client-continue.png" alt="Continue" /> | [Continue](https://docs.continue.dev/) | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-crush.svg" alt="Crush" /> | [Crush](https://github.com/charmbracelet/crush) | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="docs/client-gemini.png" alt="Gemini" /> | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` |
| <img width="48px" src="docs/client-goose.svg" alt="Goose" /> | [Goose](https://goose-docs.ai/) | `tokenjuice install goose` | `.goosehints` |
| <img width="48px" src="docs/client-grok-build.svg" alt="Grok Build" /> | [Grok Build](https://docs.x.ai/build/overview) | `tokenjuice install grok-build` | `AGENTS.md` |
| <img width="48px" src="docs/client-grok-cli.svg" alt="Grok CLI" /> | [Grok CLI](https://github.com/superagent-ai/grok-cli) | `tokenjuice install grok-cli` | `~/.grok/user-settings.json` |
| <img width="48px" src="docs/client-copilot.png" alt="GitHub Copilot coding agent" /> | [GitHub Copilot coding agent](https://docs.github.com/en/copilot/using-github-copilot/coding-agent) | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` |
| <img width="48px" src="docs/client-junie.svg" alt="Junie" /> | [Junie](https://junie.jetbrains.com/docs/junie-cli-usage.html) | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48px" src="docs/client-kiro.svg" alt="Kiro" /> | [Kiro](https://kiro.dev/) | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` |
| <img width="48px" src="docs/client-kilo.svg" alt="Kilo Code" /> | [Kilo Code](https://kilocode.ai/) | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-openhands.svg" alt="OpenHands" /> | [OpenHands](https://docs.openhands.dev/) | `tokenjuice install openhands` | `.openhands/hooks.json` |
| <img width="48px" src="docs/client-open-interpreter.svg" alt="Open Interpreter" /> | [Open Interpreter](https://www.openinterpreter.com/docs/terminal/agents_md) | `tokenjuice install open-interpreter` | `AGENTS.md` |
| <img width="48px" src="docs/client-openwebui.svg" alt="Open WebUI" /> | [Open WebUI](https://openwebui.com/) | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py` |
| <img width="48px" src="docs/client-plandex.svg" alt="Plandex" /> | [Plandex](https://docs.plandex.ai/) | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` |
| <img width="48px" src="docs/client-qoder.svg" alt="Qoder" /> | [Qoder CLI](https://docs.qoder.com/cli/using-cli) | `tokenjuice install qoder` | `AGENTS.md` |
| <img width="48px" src="docs/client-qwen-code.svg" alt="Qwen Code" /> | [Qwen Code](https://qwenlm.github.io/qwen-code-docs/) | `tokenjuice install qwen-code` | `.qwen/settings.json` |
| <img width="48px" src="docs/client-roo.svg" alt="Roo Code" /> | [Roo Code](https://roocode.com/) | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-ruler.svg" alt="Ruler" /> | [Ruler](https://github.com/intellectronica/ruler) | `tokenjuice install ruler` | `.ruler/tokenjuice.md` |
| <img width="48px" src="docs/client-windsurf.svg" alt="Windsurf" /> | [Windsurf](https://windsurf.com/) | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-zed.svg" alt="Zed" /> | [Zed](https://zed.dev/docs/ai/rules.html) | `tokenjuice install zed` | `.rules` |

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
tokenjuice install [aider|amp|antigravity|augment|avante|codex|claude-code|cline|codebuddy|continue|copilot-agent|crush|cursor|droid|gemini-cli|goose|grok-build|grok-cli|junie|kiro|kilo|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|roo|ruler|vscode-copilot|windsurf|copilot-cli|zed]
tokenjuice uninstall [aider|amp|antigravity|augment|avante|codex|cline|continue|copilot-agent|crush|droid|gemini-cli|goose|grok-build|grok-cli|junie|kiro|kilo|openhands|open-interpreter|openwebui|opencode|plandex|qoder|qwen-code|roo|ruler|vscode-copilot|windsurf|copilot-cli|zed]
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
tokenjuice install [aider|amp|antigravity|augment|avante|codex|claude-code|cline|codebuddy|continue|copilot-agent|crush|cursor|droid|gemini-cli|goose|grok-build|grok-cli|junie|kiro|kilo|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|roo|ruler|vscode-copilot|windsurf|copilot-cli|zed]
tokenjuice install [aider|amp|antigravity|augment|avante|codex|claude-code|cline|codebuddy|continue|copilot-agent|crush|cursor|droid|gemini-cli|goose|grok-build|grok-cli|junie|kiro|kilo|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|roo|ruler|vscode-copilot|windsurf|copilot-cli|zed] --local
tokenjuice uninstall [aider|amp|antigravity|augment|avante|codex|cline|continue|copilot-agent|crush|droid|gemini-cli|goose|grok-build|grok-cli|junie|kiro|kilo|openhands|open-interpreter|openwebui|opencode|plandex|qoder|qwen-code|roo|ruler|vscode-copilot|windsurf|copilot-cli|zed]
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
- [Amp integration](docs/amp-integration.md)
- [Antigravity integration](docs/antigravity-integration.md)
- [Augment integration](docs/augment-integration.md)
- [GitHub Copilot coding agent integration](docs/copilot-agent-integration.md)
- [Crush integration](docs/crush-integration.md)
- [Cursor integration](docs/cursor-integration.md)
- [CodeBuddy integration](docs/codebuddy-integration.md)
- [Goose integration](docs/goose-integration.md)
- [Grok Build integration](docs/grok-build-integration.md)
- [Grok CLI integration](docs/grok-cli-integration.md)
- [Kiro integration](docs/kiro-integration.md)
- [Kilo Code integration](docs/kilo-integration.md)
- [Open Interpreter integration](docs/open-interpreter-integration.md)
- [Open WebUI integration](docs/openwebui-integration.md)
- [Plandex integration](docs/plandex-integration.md)
- [Qoder integration](docs/qoder-integration.md)
- [Qwen Code integration](docs/qwen-code-integration.md)
- [Roo Code integration](docs/roo-integration.md)
- [Ruler integration](docs/ruler-integration.md)
- [Windsurf integration](docs/windsurf-integration.md)
- [security](SECURITY.md)

## status

usable foundation for token reduction with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
