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
tokenjuice install codebuff
tokenjuice install codegen
tokenjuice install agentloom
tokenjuice install agentsge
tokenjuice install amazon-q
tokenjuice install antigravity
tokenjuice install augment
tokenjuice install bob
tokenjuice install builder
tokenjuice install crush
tokenjuice install cursor
tokenjuice install devin
tokenjuice install firebase-studio
tokenjuice install gitlab-duo
tokenjuice install grok-build
tokenjuice install grok-cli
tokenjuice install gptme
tokenjuice install jean2
tokenjuice install jetbrains-ai
tokenjuice install goose
tokenjuice install jules
tokenjuice install kimi
tokenjuice install mistral-vibe
tokenjuice install mux
tokenjuice install ona
tokenjuice install open-interpreter
tokenjuice install openwebui
tokenjuice install plandex
tokenjuice install qoder
tokenjuice install pi
tokenjuice install opencode
tokenjuice install qwen-code
tokenjuice install replit
tokenjuice install rovo
tokenjuice install ruler
tokenjuice install tabnine
tokenjuice install trae
tokenjuice install uipath
tokenjuice install warp
tokenjuice install zencoder
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice doctor opencode
tokenjuice doctor agentloom
tokenjuice doctor agentsge
tokenjuice doctor amazon-q
tokenjuice doctor antigravity
tokenjuice doctor augment
tokenjuice doctor bob
tokenjuice doctor builder
tokenjuice doctor codebuff
tokenjuice doctor codegen
tokenjuice doctor crush
tokenjuice doctor devin
tokenjuice doctor firebase-studio
tokenjuice doctor gitlab-duo
tokenjuice doctor grok-build
tokenjuice doctor grok-cli
tokenjuice doctor gptme
tokenjuice doctor jean2
tokenjuice doctor jetbrains-ai
tokenjuice doctor goose
tokenjuice doctor jules
tokenjuice doctor kimi
tokenjuice doctor mistral-vibe
tokenjuice doctor mux
tokenjuice doctor ona
tokenjuice doctor open-interpreter
tokenjuice doctor openwebui
tokenjuice doctor plandex
tokenjuice doctor qoder
tokenjuice doctor qwen-code
tokenjuice doctor replit
tokenjuice doctor rovo
tokenjuice doctor ruler
tokenjuice doctor tabnine
tokenjuice doctor trae
tokenjuice doctor uipath
tokenjuice doctor warp
tokenjuice doctor zencoder
tokenjuice install codex --local
tokenjuice install claude-code --local
tokenjuice install codebuddy --local
tokenjuice install cursor --local
tokenjuice install devin --local
tokenjuice install grok-cli --local
tokenjuice install pi --local
tokenjuice install opencode --local
tokenjuice install qwen-code --local
tokenjuice doctor hooks --local
```

supported host hooks:

| Client | Install | Hook file | Notes |
| --- | --- | --- | --- |
| Aider | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` | ✴️ Beta. Installs a convention file that tells Aider to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Aider conventions do not intercept command output; load with `aider --read CONVENTIONS.tokenjuice.md`; see `docs/aider-integration.md` |
| Agentloom | `tokenjuice install agentloom` | `.agents/rules/tokenjuice-agentloom.md` | ✴️ Beta. Installs an Agentloom source rule that tells synced provider-native coding-agent configs to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Agentloom syncs rules rather than intercepting command output; run `agentloom sync` after install or uninstall; see `docs/agentloom-integration.md` |
| agents.ge | `tokenjuice install agentsge` | `.agents/rules/tokenjuice-agentsge.md` | ✴️ Beta. Installs an agents.ge source rule that tells synced coding-agent entrypoints to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because agents.ge propagates project memory rather than intercepting command output; run `agents sync` after install; see `docs/agentsge-integration.md` |
| Amazon Q Developer CLI / Kiro compatibility | `tokenjuice install amazon-q` | `.amazonq/rules/tokenjuice.md` | ✴️ Beta. Installs a workspace rule that tells Amazon Q Developer CLI's Amazon Q/Kiro compatibility path to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because this integration relies on the active agent loading `file://.amazonq/rules/**/*.md` as a resource and does not intercept tool output; see `docs/amazon-q-integration.md` |
| Amp | `tokenjuice install amp` | `AGENTS.md`, or existing `AGENT.md` / `CLAUDE.md` fallback | ✴️ Beta. Inserts marker-delimited instruction blocks inside the current git/project root that tell Amp to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Amp instruction files do not intercept command output; parent/user/system Amp instructions remain user-managed; see `docs/amp-integration.md` |
| Antigravity | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` | ✴️ Beta. Installs an always-on workspace rule that tells Google Antigravity to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Antigravity rules do not intercept tool output; see `docs/antigravity-integration.md` |
| Augment | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` | ✴️ Beta. Installs an `always_apply` workspace rule that tells Augment and Auggie to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Augment rules do not intercept tool output; see `docs/augment-integration.md` |
| Avante.nvim | `tokenjuice install avante` | `avante.md` | ✴️ Beta. Inserts a marker-delimited instruction block that tells Avante to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Avante instructions do not intercept tool output; see `docs/avante-integration.md` |
| IBM Bob Shell | `tokenjuice install bob` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited context block into the current git/project root that tells IBM Bob Shell to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Bob context files do not intercept tool output; see `docs/bob-integration.md` |
| Builder | `tokenjuice install builder` | `.builder/rules/tokenjuice.mdc` | ✴️ Beta. Installs an always-applied Builder Projects rule file that tells Builder and Fusion to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Builder configuration files do not intercept tool output; see `docs/builder-integration.md` |
| Claude Code | `tokenjuice install claude-code` | `~/.claude/settings.json` | Uses `PreToolUse` Bash input rewriting to route commands through `tokenjuice wrap` without bypassing Claude Code's own approval prompt; preserves unrelated hooks and migrates older Tokenjuice `PostToolUse` entries; `tokenjuice install claude-code --local` is available for repo-local verification |
| Cline | `tokenjuice install cline` | `~/Documents/Cline/Hooks/tokenjuice-post-tool-use` | ✴️ Beta. Installs a global `PostToolUse` hook script for `execute_command`; enable it in Cline's Hooks tab after install; compacted context is injected through `contextModification`; `tokenjuice install cline --local` is available for repo-local verification; see `docs/cline-integration.md` |
| Codebuff | `tokenjuice install codebuff` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited project instruction block into the current git/project root that tells Codebuff to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Codebuff instruction files do not intercept tool output; see `docs/codebuff-integration.md` |
| Codegen | `tokenjuice install codegen` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Codegen agents to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Codegen rule files do not intercept command output; see `docs/codegen-integration.md` |
| CodeBuddy (Linux/macOS/WSL) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` | Uses `PreToolUse` shell input rewriting (same pattern as Cursor) to route Bash commands through `tokenjuice wrap`; preserves unrelated hooks that share a matcher group with the tokenjuice entry; `tokenjuice install codebuddy --local` is available for repo-local verification; native Windows shell interception is intentionally blocked for now; see `docs/codebuddy-integration.md` |
| Codex CLI | `tokenjuice install codex` | `~/.codex/hooks.json` | `tokenjuice install codex --local` is available for repo-local verification |
| Continue | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` | ✴️ Beta. Installs a workspace rule that tells Continue agents to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Continue rules do not intercept tool output; see `docs/continue-integration.md` |
| Crush | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` | ✴️ Beta. Installs a project Agent Skill that tells Crush to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Crush hook composition and stateful shell behavior make command rewriting unsafe; see `docs/crush-integration.md` |
| Cursor (Linux/macOS/WSL) | `tokenjuice install cursor` | `~/.cursor/hooks.json` | Uses `preToolUse` shell input rewriting to route commands through `tokenjuice wrap`; `tokenjuice install cursor --local` is available for repo-local verification; native Windows shell interception is intentionally blocked for now; see `docs/cursor-integration.md` |
| Devin for Terminal | `tokenjuice install devin` | `.devin/hooks.v1.json` | ✴️ Beta. Uses project-local Claude-compatible `PreToolUse` exec input rewriting to route commands through `tokenjuice wrap`; preserves unrelated Devin hooks; `tokenjuice install devin --local` is available for repo-local verification; see `docs/devin-integration.md` |
| Droid (Factory CLI) | `tokenjuice install droid` | `~/.factory/settings.json` | Uses a `PostToolUse` hook for the `Execute` tool to compact shell output before Droid sees it; preserves unrelated settings keys; `tokenjuice install droid --local` is available for repo-local verification |
| Firebase Studio | `tokenjuice install firebase-studio` | `.idx/airules.md` | ✴️ Beta. Inserts a marker-delimited AI rules block that tells Gemini in Firebase chat to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Firebase Studio rules do not intercept command output; see `docs/firebase-studio-integration.md` |
| Gemini CLI | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` | ✴️ Beta. Uses an `AfterTool` hook for `run_shell_command` to compact shell output before Gemini CLI sees it; `tokenjuice install gemini-cli --local` is available for repo-local verification; see `docs/gemini-cli-integration.md` |
| GitLab Duo Agent Platform | `tokenjuice install gitlab-duo` | `.gitlab/duo/chat-rules.md` | ✴️ Beta. Inserts a marker-delimited custom-rules block that tells GitLab Duo to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because GitLab Duo custom rules do not intercept command output; see `docs/gitlab-duo-integration.md` |
| Goose | `tokenjuice install goose` | `.goosehints` | ✴️ Beta. Inserts a marker-delimited hints block that tells Goose to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Goose hints do not intercept tool output; restart the Goose session after install; see `docs/goose-integration.md` |
| Grok Build | `tokenjuice install grok-build` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Grok Build to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Grok Build instructions do not intercept command output; see `docs/grok-build-integration.md` |
| Grok CLI | `tokenjuice install grok-cli` | `~/.grok/user-settings.json` | ✴️ Beta. Uses a user-level `PostToolUse` hook for the `bash` tool; compacted context is injected alongside the original output; `tokenjuice install grok-cli --local` is available for repo-local verification; see `docs/grok-cli-integration.md` |
| gptme | `tokenjuice install gptme` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells gptme to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because gptme agent instruction files do not intercept tool output; see `docs/gptme-integration.md` |
| GitHub Copilot coding agent | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` | Uses a repo-local `postToolUse` hook for shell output so Copilot coding agent receives compacted terminal output; `tokenjuice install copilot-agent --local` is available for repo-local verification; see `docs/copilot-agent-integration.md` |
| GitHub Copilot CLI | `tokenjuice install copilot-cli` | `~/.copilot/hooks/tokenjuice-cli.json` | Uses `postToolUse` shell output rewriting on the `bash` tool (matcher `"shell"`) to compact command output before it returns to the agent. Honors `COPILOT_HOME`; the shared `~/.copilot/hooks/` dir is used with a per-host filename to coexist with the VS Code Copilot Chat install. After install, run `tokenjuice doctor copilot-cli --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so the agent treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required. |
| Jean2 | `tokenjuice install jean2` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited project instruction block into the current workspace that tells Jean2 to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Jean2 project instructions do not intercept command output; see `docs/jean2-integration.md` |
| JetBrains AI Assistant | `tokenjuice install jetbrains-ai` | `.aiassistant/rules/tokenjuice.md` | ✴️ Beta. Installs a project rule that tells JetBrains AI Assistant chat to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because AI Assistant project rules do not intercept tool output; see `docs/jetbrains-ai-integration.md` |
| Junie | `tokenjuice install junie` | `.junie/AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block that tells Junie to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Junie instructions do not intercept tool output; see `docs/junie-integration.md` |
| Jules | `tokenjuice install jules` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Jules to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Jules root `AGENTS.md` instructions do not intercept command output; see `docs/jules-integration.md` |
| Kimi Code CLI | `tokenjuice install kimi` | `~/.kimi/config.toml` | ✴️ Beta. Uses a `PostToolUse` hook for the `Shell` tool; compacted context is injected alongside the original output; honors `KIMI_SHARE_DIR`; `tokenjuice install kimi --local` is available for repo-local verification; see `docs/kimi-integration.md` |
| Kiro | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` | ✴️ Beta. Installs an always-included steering file that tells Kiro to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Kiro hooks do not replace terminal command output; see `docs/kiro-integration.md` |
| Kilo Code | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` | ✴️ Beta. Registers a workspace rule that tells Kilo Code to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Kilo Code rules do not intercept tool output; see `docs/kilo-integration.md` |
| Mistral Vibe | `tokenjuice install mistral-vibe` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Mistral Vibe to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Mistral Vibe root `AGENTS.md` instructions do not intercept tool output; see `docs/mistral-vibe-integration.md` |
| Mux | `tokenjuice install mux` | `.mux/tool_post` | ✴️ Beta. Installs a project-local `tool_post` hook that emits compacted context for noisy `bash` output through Mux hook output; the original tool result is still shown by Mux; see `docs/mux-integration.md` |
| Ona Agent | `tokenjuice install ona` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Ona Agent to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Ona `AGENTS.md` instructions do not intercept command output; see `docs/ona-integration.md` |
| OpenCode | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` | Installs a project-agnostic plugin that is auto-loaded on OpenCode session start; `tokenjuice install opencode --local` bundles the plugin from the current repo source |
| OpenHands | `tokenjuice install openhands` | `.openhands/hooks.json` | ✴️ Beta. Uses a project-local `PostToolUse` hook for `terminal` output; compacted context is injected alongside the original output; `tokenjuice install openhands --local` is available for repo-local verification; see `docs/openhands-integration.md` |
| Open Interpreter | `tokenjuice install open-interpreter` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Open Interpreter to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Open Interpreter `AGENTS.md` instructions do not intercept tool output; global Open Interpreter instructions remain user-managed; see `docs/open-interpreter-integration.md` |
| Open WebUI | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py` | ✴️ Beta. Exports a reviewable Workspace Tool source file for manual administrator import; the tool compacts provided terminal output through `tokenjuice reduce-json` and does not execute user commands; see `docs/openwebui-integration.md` |
| Plandex | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` | ✴️ Beta. Installs a loadable context convention that tells Plandex to use `tokenjuice wrap` for noisy terminal commands, `tokenjuice wrap --raw -- <command>` only when raw bytes are needed, and `tokenjuice wrap -- <command> \| plandex load` when loading noisy output into context; guidance-only, because Plandex context files do not intercept command output; load with `plandex load PLANDEX.tokenjuice.md`; see `docs/plandex-integration.md` |
| Qoder CLI | `tokenjuice install qoder` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Qoder CLI to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Qoder `AGENTS.md` memory does not intercept command output; see `docs/qoder-integration.md` |
| pi | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` | `tokenjuice install pi --local` forces the extension bundle to be rebuilt from the current repo source and adds `/tj` controls inside pi |
| Qwen Code | `tokenjuice install qwen-code` | `.qwen/settings.json` | ✴️ Beta. Uses a project-local `PostToolUse` hook for shell tools; compacted context is injected alongside the original output; `tokenjuice install qwen-code --local` is available for repo-local verification; see `docs/qwen-code-integration.md` |
| Replit Agent | `tokenjuice install replit` | `replit.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells Replit Agent to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Replit `replit.md` project context does not intercept command output and Agent may update the file as project knowledge changes; see `docs/replit-integration.md` |
| Roo Code | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` | ✴️ Beta. Inserts a marker-delimited workspace rule that tells Roo to use `tokenjuice wrap` for noisy `execute_command` terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Roo workspace rules do not intercept tool output; see `docs/roo-integration.md` |
| Rovo Dev CLI | `tokenjuice install rovo` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited project memory block into the current git/project root that tells Rovo Dev CLI to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Rovo Dev memory files do not intercept tool output; see `docs/rovo-integration.md` |
| Ruler | `tokenjuice install ruler` | `.ruler/tokenjuice.md` | ✴️ Beta. Installs a Ruler source rule that tells configured coding agents to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Ruler propagates rules rather than intercepting command output; run `ruler apply` after install; see `docs/ruler-integration.md` |
| Tabnine CLI | `tokenjuice install tabnine` | `TABNINE.md` | ✴️ Beta. Inserts a marker-delimited project context block into the current git/project root that tells Tabnine CLI to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Tabnine context files do not intercept tool output; see `docs/tabnine-integration.md` |
| Trae | `tokenjuice install trae` | `.trae/rules/project_rules.md` | ✴️ Beta. Inserts a marker-delimited project rule block that tells Trae to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Trae `.rules` files do not intercept command output; see `docs/trae-integration.md` |
| UiPath for Coding Agents | `tokenjuice install uipath` | `AGENTS.md` | ✴️ Beta. Inserts a marker-delimited instruction block into the current git/project root that tells coding agents working through UiPath to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because `AGENTS.md` instructions do not intercept command output; see `docs/uipath-integration.md` |
| Warp | `tokenjuice install warp` | `AGENTS.md` / `WARP.md` | ✴️ Beta. Inserts a marker-delimited project rules block into the current git/project root that tells Warp to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; fresh installs write `WARP.md` when that file already exists because Warp gives it priority over `AGENTS.md`, while existing tokenjuice Warp blocks in `AGENTS.md` continue to be managed there until explicitly removed; guidance-only, because Warp rules do not intercept tool output; see `docs/warp-integration.md` |
| VS Code Copilot Chat | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` | Uses `PreToolUse` shell input rewriting on the `runTerminalCommand` tool to route commands through `tokenjuice wrap`; still accepts the legacy `run_in_terminal` tool name and installs a matcher for both names so the shared hooks dir does not wake the hook for unrelated Copilot CLI tools. Requires `chat.useHooks` enabled and a trusted workspace. Ignores `COPILOT_HOME`; the shared `~/.copilot/hooks/` dir is used with a per-host filename to coexist with the Copilot CLI install. After install, run `tokenjuice doctor vscode-copilot --print-instructions` and paste the snippet into the repo's `.github/copilot-instructions.md` (or `AGENTS.md`) so the agent treats compacted output as authoritative and only prefixes `tokenjuice wrap --raw --` when raw bytes are required. |
| Windsurf | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` | ✴️ Beta. Installs an always-on workspace rule that tells Cascade to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Cascade Hooks do not replace terminal command output; see `docs/windsurf-integration.md` |
| Zed | `tokenjuice install zed` | `.rules` | ✴️ Beta. Inserts a marker-delimited rule block that tells Zed Agent to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Zed rules do not intercept tool output; see `docs/zed-integration.md` |
| Zencoder | `tokenjuice install zencoder` | `.zencoder/rules/tokenjuice.md` | ✴️ Beta. Installs an always-applied Zen Rule that tells Zencoder to use `tokenjuice wrap` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are needed; guidance-only, because Zen Rules do not intercept tool output; see `docs/zencoder-integration.md` |

`tokenjuice doctor hooks` inspects installed host hooks together, including the Pi extension, spots stale Cellar-pinned Homebrew commands, and points back to the right install command for repair. `tokenjuice doctor droid`, `tokenjuice doctor pi`, `tokenjuice doctor opencode`, `tokenjuice doctor openhands`, `tokenjuice doctor open-interpreter`, `tokenjuice doctor openwebui`, `tokenjuice doctor mistral-vibe`, `tokenjuice doctor mux`, `tokenjuice doctor ona`, `tokenjuice doctor plandex`, `tokenjuice doctor qoder`, `tokenjuice doctor replit`, `tokenjuice doctor firebase-studio`, `tokenjuice doctor trae`, `tokenjuice doctor uipath`, `tokenjuice doctor warp`, `tokenjuice doctor grok-build`, `tokenjuice doctor grok-cli`, `tokenjuice doctor kimi`, `tokenjuice doctor qwen-code`, `tokenjuice doctor continue`, `tokenjuice doctor aider`, `tokenjuice doctor agentloom`, `tokenjuice doctor agentsge`, `tokenjuice doctor amazon-q`, `tokenjuice doctor amp`, `tokenjuice doctor antigravity`, `tokenjuice doctor augment`, `tokenjuice doctor avante`, `tokenjuice doctor builder`, `tokenjuice doctor codegen`, `tokenjuice doctor jean2`, `tokenjuice doctor jetbrains-ai`, `tokenjuice doctor junie`, `tokenjuice doctor jules`, `tokenjuice doctor kiro`, `tokenjuice doctor kilo`, `tokenjuice doctor roo`, `tokenjuice doctor rovo`, `tokenjuice doctor ruler`, `tokenjuice doctor goose`, `tokenjuice doctor windsurf`, `tokenjuice doctor zed`, `tokenjuice doctor zencoder`, `tokenjuice doctor cline`, `tokenjuice doctor crush`, `tokenjuice doctor devin`, `tokenjuice doctor vscode-copilot`, and `tokenjuice doctor copilot-cli` are the direct per-host checks. the `--local` variant expects Codex, Claude Code, Cline, CodeBuddy, Crush, Cursor, Devin, Droid, Gemini CLI, Grok CLI, Kimi, Mux, OpenHands, Qwen Code, VS Code Copilot, and Copilot CLI hooks to point at the current repo build instead of the installed launcher on `PATH`.

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

default storage is `~/.tokenjuice/artifacts`. set `TOKENJUICE_ARTIFACT_DIR`
to override that base directory, or pass `storeDir` through the library/cli
surfaces that already support it.

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
