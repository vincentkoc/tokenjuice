# tokenjuice spec

## summary

tokenjuice is a TypeScript-first output compaction system for terminal-heavy and agent-heavy workflows.

it has two explicit product surfaces:

- `tokenjuice`: the core library + CLI
- host adapters like `openclaw-tokenjuice`: thin wrappers over host hooks

the package reduces observed output after execution, can store raw output as a local artifact when explicitly requested, and keeps prompt-facing text compact and deterministic.

## goals

- cut transcript token waste without changing command semantics
- keep raw output recoverable and inspectable
- prefer deterministic reducers over vague summaries
- keep the core host-agnostic
- make the CLI clean enough for npm first, then brew/apt/dnf packaging

## non-goals

- silent command rewriting by default
- turning v1 into an LLM summarizer
- becoming a shell framework
- trying to solve every tool class in one release

## truncation model

tokenjuice intentionally uses deterministic truncation as a default strategy for prompt-facing output. this is a cost/clarity tradeoff, not an error path.

there are two independent boundaries:

- reducer boundary: rule summaries (especially `generic/fallback`) keep head/tail slices and may omit middle sections.
- capture boundary: `tokenjuice wrap` enforces `--max-capture-bytes` (default `4mb`) to avoid unbounded memory growth while collecting tool output.

important implications:

- `--raw` is the explicit escape hatch for reducer compaction.
- `--raw` does not bypass capture limits; increase `--max-capture-bytes` when full capture is required.
- frequent `generic/fallback` matches on a command family are a reducer-coverage signal, not a reason to make fallback "smarter".

## architecture

### core package

the core package owns:

- classification
- reduction
- artifact storage
- rule loading and validation
- CLI behavior

the public model is deliberately plain-object heavy. no framework assumptions, no giant class graph.

### adapters

host adapters should own:

- hook wiring
- host-specific storage defaults
- message conversion
- retrieval seams when needed
- host-native installation surfaces such as hooks or extension files

if reducer logic starts leaking into an adapter, the boundary is wrong.

for contributor guidance on introducing a new host integration, see `docs/integration-playbook.md`.

host adapters choose an inspection policy before calling the shared compactor. the Codex, Claude Code, and pi adapters use the safe-inventory policy:

- exact file-content reads stay raw (`cat`, `sed`, `head`, `tail`, `nl`, `bat`, `jq`, `yq`)
- standalone repository inventory commands can compact when they are inventory-only (`find`, `ls`, `rg --files`, `git ls-files`, `fd`)
- inventory pipelines compact only when downstream commands are structural stdin transforms (`sort`, `head`, `tail`, `uniq`)
- source inventory commands that execute other commands, such as `find ... -exec ...` or `fd --exec ...`, stay raw
- mixed command sequences and unsafe inventory pipelines stay raw

## operating modes

### reduce

reduce text from stdin or a file:

```bash
tokenjuice reduce
tokenjuice reduce build.log
pnpm test 2>&1 | tokenjuice reduce
```

### reduce-json

reduce a structured tool payload for host adapters:

```bash
cat payload.json | tokenjuice reduce-json
tokenjuice reduce-json payload.json
```

this is the machine-facing protocol surface. it accepts either:

- a direct `ToolExecutionInput` JSON object
- an envelope with `{ input, options }`

### wrap

explicitly run a command through tokenjuice:

```bash
tokenjuice wrap -- git status
tokenjuice wrap --store -- pnpm test
```

this is command wrapping, not command rewriting.

### artifact

inspect stored raw output:

```bash
tokenjuice ls
tokenjuice cat tj_xxxxx
```

### verify

validate the loaded rule set:

```bash
tokenjuice verify
tokenjuice verify --format json
tokenjuice verify --fixtures
```

### discover

inspect stored artifacts and surface likely next reducer work:

```bash
tokenjuice discover
tokenjuice discover build.log --source-command "pnpm tsc --noEmit" --exit-code 2
```

### doctor

summarize reducer health and savings:

```bash
tokenjuice doctor
tokenjuice doctor hooks
tokenjuice doctor pi
cat build.log | tokenjuice doctor --source-command "pnpm eslint src" --exit-code 1
```

### stats

summarize stored artifact history:

```bash
tokenjuice stats
tokenjuice stats --format json
tokenjuice stats --timezone utc
```

daily stats are bucketed in the local timezone by default. pass `--timezone utc` for UTC buckets or an IANA timezone such as `America/New_York` for explicit reporting.

### install

install host wiring when tokenjuice can own it directly:

```bash
tokenjuice install codex
tokenjuice install claude-code
tokenjuice install codebuddy
tokenjuice install cursor
tokenjuice install pi
tokenjuice install opencode
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice doctor opencode
tokenjuice install codex --local
tokenjuice install claude-code --local
tokenjuice install codebuddy --local
tokenjuice install cursor --local
tokenjuice install pi --local
tokenjuice install opencode --local
tokenjuice doctor hooks --local
```

supported host hooks:

| Client | Install | Hook file | Notes |
| --- | --- | --- | --- |
| Aider | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` | ✴️ Beta. Installs a convention file that tells Aider to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Aider conventions do not intercept command output; load with `aider --read CONVENTIONS.tokenjuice.md`; see `docs/aider-integration.md` |
| Avante.nvim | `tokenjuice install avante` | `avante.md` | ✴️ Beta. Inserts a marker-delimited instruction block that tells Avante to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Avante instructions do not intercept tool output; see `docs/avante-integration.md` |
| Claude Code | `tokenjuice install claude-code` | `~/.claude/settings.json` | Preserves unrelated settings keys while updating `hooks.PostToolUse`; `tokenjuice install claude-code --local` is available for repo-local verification |
| Cline | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` | ✴️ Beta. Installs a global `PostToolUse` hook script for `execute_command`; enable it in Cline's Hooks tab after install; compacted context is injected through `contextModification`; `tokenjuice install cline --local` is available for repo-local verification; see `docs/cline-integration.md` |
| CodeBuddy (Linux/macOS/WSL) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` | Uses `PreToolUse` shell input rewriting (same pattern as Cursor) to route Bash commands through `tokenjuice wrap`; preserves unrelated hooks that share a matcher group with the tokenjuice entry; `tokenjuice install codebuddy --local` is available for repo-local verification; native Windows shell interception is intentionally blocked for now; see `docs/codebuddy-integration.md` |
| Codex CLI | `tokenjuice install codex` | `~/.codex/hooks.json` | `tokenjuice install codex --local` is available for repo-local verification |
| Continue | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` | ✴️ Beta. Installs a workspace rule that tells Continue agents to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Continue rules do not intercept tool output; see `docs/continue-integration.md` |
| Cursor (Linux/macOS/WSL) | `tokenjuice install cursor` | `~/.cursor/hooks.json` | Uses `preToolUse` shell input rewriting to route commands through `tokenjuice wrap`; `tokenjuice install cursor --local` is available for repo-local verification; native Windows shell interception is intentionally blocked for now; see `docs/cursor-integration.md` |
| Droid (Factory CLI) | `tokenjuice install droid` | `~/.factory/settings.json` | ✴️ Beta. Uses a `PostToolUse` hook for the `Execute` tool to compact shell output before Droid sees it; preserves unrelated settings keys; `tokenjuice install droid --local` is available for repo-local verification |
| Gemini CLI | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` | ✴️ Beta. Uses an `AfterTool` hook for `run_shell_command` to compact shell output before Gemini CLI sees it; `tokenjuice install gemini-cli --local` is available for repo-local verification; see `docs/gemini-cli-integration.md` |
| GitHub Copilot CLI | `tokenjuice install copilot-cli` | `~/.copilot/hooks/tokenjuice-cli.json` | Uses `postToolUse` shell output rewriting on the `bash` tool (matcher `"shell"`) to compact command output before it returns to the agent. Honors `COPILOT_HOME`; the shared `~/.copilot/hooks/` dir is used with a per-host filename to coexist with the VS Code Copilot Chat install. After install, run `tokenjuice doctor copilot-cli --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so the agent treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required. |
| Junie | `tokenjuice install junie` | `.junie/AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block that tells Junie to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Junie instructions do not intercept tool output; see `docs/junie-integration.md` |
| OpenCode | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` | Installs a project-agnostic plugin that is auto-loaded on OpenCode session start; `tokenjuice install opencode --local` bundles the plugin from the current repo source |
| OpenHands | `tokenjuice install openhands` | `.openhands/hooks.json` | ✴️ Beta. Uses a project-local `PostToolUse` hook for `terminal` output; compacted context is injected alongside the original output; `tokenjuice install openhands --local` is available for repo-local verification; see `docs/openhands-integration.md` |
| pi | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` | `tokenjuice install pi --local` forces the extension bundle to be rebuilt from the current repo source and adds `/tj` controls inside pi |
| VS Code Copilot Chat | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` | Uses `preToolUse` shell input rewriting on the `run_in_terminal` tool to route commands through `tokenjuice wrap`. Requires `chat.useHooks` enabled and a trusted workspace. Ignores `COPILOT_HOME`; the shared `~/.copilot/hooks/` dir is used with a per-host filename to coexist with the Copilot CLI install. After install, run `tokenjuice doctor vscode-copilot --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so the agent treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required. |
| Zed | `tokenjuice install zed` | `.rules` | ✴️ Beta. Inserts a marker-delimited rule block that tells Zed Agent to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Zed rules do not intercept tool output; see `docs/zed-integration.md` |

`tokenjuice doctor hooks` inspects installed host hooks together, including the Pi extension, spots stale Cellar-pinned Homebrew commands, and points back to the right install command for repair. `tokenjuice doctor droid`, `tokenjuice doctor pi`, `tokenjuice doctor opencode`, `tokenjuice doctor openhands`, `tokenjuice doctor continue`, `tokenjuice doctor aider`, `tokenjuice doctor avante`, `tokenjuice doctor junie`, `tokenjuice doctor zed`, `tokenjuice doctor cline`, `tokenjuice doctor vscode-copilot`, and `tokenjuice doctor copilot-cli` are the direct per-host checks. the `--local` variant expects Codex, Claude Code, Cline, CodeBuddy, Cursor, Droid, Gemini CLI, OpenHands, VS Code Copilot, and Copilot CLI hooks to point at the current repo build instead of the installed launcher on `PATH`.

`tokenjuice uninstall codex` removes the tokenjuice Codex PostToolUse hook from `~/.codex/hooks.json`. once removed, `tokenjuice doctor codex` and `tokenjuice doctor hooks` report that state as `disabled` instead of treating it like a broken install. `tokenjuice uninstall opencode` removes the OpenCode plugin from `~/.config/opencode/plugins/tokenjuice.js`.

## rule model

tokenjuice uses JSON rules because they are easy to parse, easy to validate, and easy to inspect in tooling.

rule behavior is intentionally small:

- `match`
- `filters`
- `transforms`
- `summarize`
- `failure`
- `counters`

more power belongs in the core engine first. a huge DSL too early is how these tools get gross.

## rule precedence

rules load in this order:

1. built-in rules
2. user rules from `~/.config/tokenjuice/rules`
3. project rules from `.tokenjuice/rules`

later layers override earlier ones by rule id.

this gives a sane default without forcing people to fork the package for one weird project.

## artifact model

artifacts are file-backed in v1:

- one raw text file
- one metadata JSON file

that is intentionally boring. boring is good here.

## reliability priorities

- keep raw artifact storage opt-in
- store raw artifacts with private permissions where the platform supports it
- validate artifact ids before lookup
- bound captured output and direct input sizes so hostile or accidental huge logs do not blow up memory
- validate rule structure before loading
- compile regex once at load time, not every reduction call
- choose the most specific matching rule, not the first one that happens to match
- keep fallback behavior deterministic
- preserve more context on non-zero exits
- make verification cheap and scriptable
- make diagnostics artifact-driven so tuning follows real usage
- make savings measurable per reducer and per command over time
- keep reducer behavior pinned with fixture-backed verification

## next targets

- `discover`
- `doctor`
- more reducers for tests and build output
- better host adapters

## distribution

tokenjuice should ship as a real terminal app through one compiled path:

- build TypeScript to runnable JavaScript in `dist/`
- publish the npm package with the `tokenjuice` bin entry
- generate a GitHub release tarball with `dist/` plus a small launcher
- generate a Homebrew formula from that tarball

that keeps npm, `npx`, global installs, and Homebrew aligned around one executable surface instead of juggling a second native-binary path too early.
