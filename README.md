<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

## what it does

an agent or harness calls noisy tools like `git status`, `pnpm test`, `pnpm --help`, `docker build`, or `rg`.

tokenjuice sits in front of that tool call, runs it, trims the fat from the output, and passes back a much cleaner result to the harness.

the important bit is the boundary:

- the original command still runs
- tokenjuice compacts the observed output after execution
- `--raw` / `--full` gives you an explicit unaltered escape hatch when you need it
- raw output can be stored locally when you explicitly ask for it
- the harness gets a smaller, more useful payload instead of a wall of terminal junk

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
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed]
tokenjuice uninstall [aider|avante|codex|cline|continue|gemini-cli|junie|openhands|opencode|vscode-copilot|copilot-cli|zed]
```

OpenClaw support is bundled on the OpenClaw side. Do not run
`tokenjuice install openclaw`; enable the bundled plugin instead:

```bash
openclaw config set plugins.entries.tokenjuice.enabled true
```

this requires OpenClaw `2026.4.22` or newer.

## why

tool output wastes absurd amounts of context. your llm needs a diet.

tokenjuice compacts observed output after execution, gives hosts a boring, deterministic summary by default, and only stores raw output when you explicitly ask for it.

## goals

- library first, not framework-locked
- JSON rules for parseability and inspection
- explicit `reduce` and `wrap` modes
- file-backed artifacts that are easy to debug
- no silent command rewrite
- speed and reliability over gimmicks

## commands

```bash
tokenjuice --help
tokenjuice --version
tokenjuice reduce [file]
tokenjuice reduce-json [file]
tokenjuice wrap -- <command> [args...]
tokenjuice wrap --raw -- <command> [args...]
tokenjuice wrap --store -- <command> [args...]
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed]
tokenjuice install [aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|copilot-cli|zed] --local
tokenjuice uninstall [aider|avante|codex|cline|continue|gemini-cli|junie|openhands|opencode|vscode-copilot|copilot-cli|zed]
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

tokenjuice has host integrations for:

| Logo | Client | Install | Hook file | Supported |
| --- | --- | --- | --- | --- |
| ✴️ | [Aider](https://aider.chat/) | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` | ✴️ Beta |
| ✴️ | [Avante.nvim](https://github.com/yetone/avante.nvim) | `tokenjuice install avante` | `avante.md` | ✴️ Beta |
| <img width="48px" src="docs/client-claude.jpg" alt="Claude" /> | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `tokenjuice install claude-code` | `~/.claude/settings.json` | ✅ Yes |
| ✴️ | [Cline](https://docs.cline.bot/features/hooks/hook-reference) | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` | ✴️ Beta |
| <img width="48px" src="docs/client-codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy](https://codebuddy.tencent.com/) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` | ✅ Yes |
| <img width="48px" src="docs/client-openai.jpg" alt="Codex" /> | [Codex CLI](https://github.com/openai/codex) | `tokenjuice install codex` | `~/.codex/hooks.json` | ✅ Yes |
| ✴️ | [Continue](https://docs.continue.dev/) | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` | ✴️ Beta |
| <img width="48px" src="docs/client-cursor.jpg" alt="Cursor" /> | [Cursor](https://cursor.com/docs/hooks) | `tokenjuice install cursor` | `~/.cursor/hooks.json` | ✅ Yes |
| ✴️ | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` | ✴️ Beta |
| <img width="48px" src="docs/client-copilot.png" alt="GitHub Copilot CLI" /> | [GitHub Copilot CLI](https://github.com/github/copilot-cli) | `tokenjuice install copilot-cli` | `~/.copilot/hooks/tokenjuice-cli.json` | ✅ Yes |
| ✴️ | [Junie](https://junie.jetbrains.com/docs/junie-cli-usage.html) | `tokenjuice install junie` | `.junie/AGENTS.md` | ✴️ Beta |
| <img width="48px" src="docs/client-openclaw.jpg" alt="OpenClaw" /> | [OpenClaw](https://openclaw.ai/) | `openclaw config set plugins.entries.tokenjuice.enabled true` | `~/.openclaw/openclaw.json` | ✅ Yes (`2026.4.22+`) |
| <img width="48px" src="docs/client-opencode.png" alt="OpenCode" /> | [OpenCode](https://opencode.ai/) | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` | ✅ Yes |
| ✴️ | [OpenHands](https://docs.openhands.dev/) | `tokenjuice install openhands` | `.openhands/hooks.json` | ✴️ Beta |
| <img width="48px" src="docs/client-pi.png" alt="pi" /> | [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` | ✅ Yes |
| <img width="48px" src="docs/client-copilot.png" alt="VS Code Copilot" /> | [VS Code Copilot Chat](https://code.visualstudio.com/docs/copilot/overview) (Stable **and** Insiders) | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` | ✅ Yes |
| ✴️ | [Zed](https://zed.dev/docs/ai/rules.html) | `tokenjuice install zed` | `.rules` | ✴️ Beta |

shared behavior:

- the original shell command still runs untouched
- tokenjuice only rewrites the output that goes back through the hook or extension
- raw command execution logs are still raw
- `tokenjuice doctor hooks` checks installed host hooks together instead of making you guess which integration drifted
- `tokenjuice doctor pi` inspects the installed Pi extension directly when you only care about that surface
- `tokenjuice doctor opencode` inspects the installed OpenCode plugin directly when you only care about that surface
- `tokenjuice uninstall codex` cleanly removes the Codex hook and `tokenjuice doctor hooks` reports that as `disabled`, not broken
- `tokenjuice uninstall opencode` cleanly removes the OpenCode plugin and points back to `tokenjuice install opencode` for re-enabling
- `tokenjuice install [aider|codex|claude-code|cline|codebuddy|continue|cursor|gemini-cli|junie|openhands|opencode] --local` / `tokenjuice doctor hooks --local` are for testing the current repo build before release
- `pnpm e2e:local` builds the repo and smoke-tests the local Codex app-server CLI and Claude Code CLI hook pass-through paths
- OpenClaw ships tokenjuice as a bundled plugin, so setup is an OpenClaw config change, not a `tokenjuice install ...` step
- `tokenjuice install opencode` installs a project-agnostic plugin into `~/.config/opencode/plugins/tokenjuice.js`
- `tokenjuice install pi --local` forces the installed pi extension to be bundled from the current repo source, so local integration changes can be verified before release
- after `tokenjuice install vscode-copilot`, run `tokenjuice doctor vscode-copilot --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so Copilot Chat treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required
- after `tokenjuice install copilot-cli`, run `tokenjuice doctor copilot-cli --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so the GitHub Copilot CLI agent treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required
- Claude Code preserves unrelated settings keys while updating `hooks.PostToolUse`
- Codex, Claude Code, Cline, CodeBuddy, Cursor, OpenClaw, OpenCode, and pi keep exact file-content reads raw, but compact safe repository inventory commands such as `find`, `ls`, `rg --files`, `git ls-files`, and `fd`

library-side adapters can also use `runReduceJsonCli(...)` to call the CLI without rebuilding the child-process + JSON plumbing themselves.

repository inventory compaction is deliberately narrow. standalone inventory commands compact only when they are inventory-only, and pipelines only compact when every downstream segment is a structural stdin transform: `sort`, `head`, `tail`, or `uniq`. mixed command sequences, source commands that execute other commands such as `find ... -exec ...` or `fd --exec ...`, and pipelines such as `find ... | xargs wc -l`, `rg --files | rg TODO src`, or `git ls-files | jq -R .` stay raw.

for Aider, `tokenjuice install aider` installs a beta convention file at `CONVENTIONS.tokenjuice.md`. load it with `aider --read CONVENTIONS.tokenjuice.md` or add it to `.aider.conf.yml`.

for Avante.nvim, `tokenjuice install avante` inserts a marker-delimited beta block into `avante.md`. this is guidance-only: Avante still owns command execution, but the instructions tell it to use `tokenjuice wrap` for noisy terminal commands and only use the raw escape hatch when needed.

for OpenCode, `tokenjuice install opencode` installs a project-agnostic plugin into `~/.config/opencode/plugins/tokenjuice.js`. restart OpenCode after install; the plugin is auto-loaded on session start.

for Cline, `tokenjuice install cline` installs a beta global hook script into `~/Documents/Cline/Hooks/tokenjuice-post-tool-use`. enable it as a `PostToolUse` hook in Cline's Hooks tab after install.

for Continue, `tokenjuice install continue` installs a beta workspace rule into `.continue/rules/tokenjuice.md`. this is guidance-only: Continue still owns command execution, but the rule tells the agent to use `tokenjuice wrap` for noisy terminal commands and only use the raw escape hatch when needed.

for Junie, `tokenjuice install junie` inserts a marker-delimited beta block into `.junie/AGENTS.md`. this is guidance-only: Junie still owns command execution, but the instructions tell it to use `tokenjuice wrap` for noisy terminal commands and only use the raw escape hatch when needed.

for Zed, `tokenjuice install zed` inserts a marker-delimited beta block into `.rules`. this is guidance-only: Zed still owns command execution, but the rules tell it to use `tokenjuice wrap` for noisy terminal commands and only use the raw escape hatch when needed.

for OpenHands, `tokenjuice install openhands` installs a project-local beta hook into `.openhands/hooks.json`. tokenjuice listens to `PostToolUse` events for the `terminal` tool and injects compacted context alongside the original output.

for pi, `tokenjuice install pi` installs a project-agnostic extension into `~/.pi/agent/extensions/tokenjuice.js`. after `/reload`, pi compacts noisy `bash` tool results and exposes `/tj status`, `/tj on`, `/tj off`, and `/tj raw-next`.

for OpenClaw, tokenjuice ships as a bundled plugin. enable it with:

```bash
openclaw config set plugins.entries.tokenjuice.enabled true
```

this requires OpenClaw `2026.4.22` or newer.

there is no `tokenjuice install openclaw` command.

when a reducer gets it wrong or the engine needs the untouched output, use the explicit bypass:

```bash
tokenjuice wrap --raw -- pnpm --help
tokenjuice wrap --full -- git status
```

if the hook itself goes stale after a package upgrade, repair it with:

```bash
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice doctor opencode
tokenjuice install [codex|claude-code|codebuddy|cursor|pi|opencode]
```

for machine callers, set:

```json
{
  "options": {
    "raw": true
  }
}
```

envelope payload:

```json
{
  "input": {
    "toolName": "exec",
    "command": "pnpm test",
    "combinedText": "RUN  v3.2.4 /repo\n...",
    "exitCode": 1
  },
  "options": {
    "classifier": "tests/pnpm-test",
    "store": true,
    "maxInlineChars": 1200
  }
}
```

## adapter JSON

`reduce-json` is the machine-facing adapter command. it reads JSON from stdin or a file and always writes JSON to stdout.

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

## rule system

- built-in JSON rules live in `src/rules`
- user overrides live in `~/.config/tokenjuice/rules`
- project overrides live in `.tokenjuice/rules`
- later layers override earlier ones by rule id

## docs

- spec: `docs/spec.md`
- rules: `docs/rules.md`
- cursor integration: `docs/cursor-integration.md`
- codebuddy integration: `docs/codebuddy-integration.md`
- integration playbook: `docs/integration-playbook.md`
- security: `SECURITY.md`

## status

usable foundation for token reduction with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
