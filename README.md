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
| <img width="48px" src="docs/client-avante.png" alt="Avante" /> | [Avante.nvim](https://github.com/yetone/avante.nvim) | `tokenjuice install avante` | `avante.md` |
| <img width="48px" src="docs/client-cline.svg" alt="Cline" /> | [Cline](https://docs.cline.bot/features/hooks/hook-reference) | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` |
| <img width="48px" src="docs/client-continue.png" alt="Continue" /> | [Continue](https://docs.continue.dev/) | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48px" src="docs/client-gemini.png" alt="Gemini" /> | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` |
| <img width="48px" src="docs/client-junie.svg" alt="Junie" /> | [Junie](https://junie.jetbrains.com/docs/junie-cli-usage.html) | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48px" src="docs/client-openhands.svg" alt="OpenHands" /> | [OpenHands](https://docs.openhands.dev/) | `tokenjuice install openhands` | `.openhands/hooks.json` |
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
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|droid|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed]
tokenjuice uninstall [aider|avante|codex|cline|continue|droid|gemini-cli|junie|openhands|opencode|vscode-copilot|copilot-cli|zed]
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
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|droid|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed]
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|droid|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed] --local
tokenjuice uninstall [aider|avante|codex|cline|continue|droid|gemini-cli|junie|openhands|opencode|vscode-copilot|copilot-cli|zed]
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
- [Cursor integration](docs/cursor-integration.md)
- [CodeBuddy integration](docs/codebuddy-integration.md)
- [security](SECURITY.md)

## status

usable foundation for token reduction with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
