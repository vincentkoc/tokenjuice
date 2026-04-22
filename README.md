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
tokenjuice install [codex|claude-code|codebuddy|cursor|pi]
tokenjuice uninstall codex
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
tokenjuice install [codex|claude-code|codebuddy|cursor|pi]
tokenjuice install [codex|claude-code|codebuddy|cursor|pi] --local
tokenjuice uninstall codex
tokenjuice ls
tokenjuice cat <artifact-id>
tokenjuice verify
tokenjuice discover
tokenjuice doctor
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice stats
tokenjuice stats --timezone utc
```

## overview

tokenjuice has host integrations for:

| Logo | Client | Install | Hook file | Supported |
| --- | --- | --- | --- | --- |
| <img width="48px" src="docs/client-claude.jpg" alt="Claude" /> | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `tokenjuice install claude-code` | `~/.claude/settings.json` | ✅ Yes |
| <img width="48px" src="docs/client-openai.jpg" alt="Codex" /> | [Codex CLI](https://github.com/openai/codex) | `tokenjuice install codex` | `~/.codex/hooks.json` | ✅ Yes |
| <img width="48px" src="docs/client-cursor.jpg" alt="Cursor" /> | [Cursor](https://cursor.com/docs/hooks) | `tokenjuice install cursor` | `~/.cursor/hooks.json` | ✅ Yes |
| <img width="48px" src="docs/client-codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy Code](https://codebuddy.tencent.com/) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` | ✅ Yes |
| <img width="48px" src="docs/client-openclaw.jpg" alt="OpenClaw" /> | [OpenClaw](https://openclaw.ai/) | `openclaw config set plugins.entries.tokenjuice.enabled true` | `~/.openclaw/openclaw.json` | ✅ Yes (`2026.4.22+`) |
| <img width="48px" src="docs/client-pi.png" alt="pi" /> | [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` | ✅ Yes |

shared behavior:

- the original shell command still runs untouched
- tokenjuice only rewrites the output that goes back through the hook or extension
- raw command execution logs are still raw
- `tokenjuice doctor hooks` checks installed host hooks together instead of making you guess which integration drifted
- `tokenjuice doctor pi` inspects the installed Pi extension directly when you only care about that surface
- `tokenjuice uninstall codex` cleanly removes the Codex hook and `tokenjuice doctor hooks` reports that as `disabled`, not broken
- `tokenjuice install [codex|claude-code|codebuddy|cursor] --local` / `tokenjuice doctor hooks --local` are for testing the current repo build before release
- OpenClaw ships tokenjuice as a bundled plugin, so setup is an OpenClaw config change, not a `tokenjuice install ...` step
- `tokenjuice install pi --local` forces the installed pi extension to be bundled from the current repo source, so local integration changes can be verified before release
- Claude Code preserves unrelated settings keys while updating `hooks.PostToolUse`
- Codex, Claude Code, CodeBuddy, Cursor, OpenClaw, and pi keep exact file-content reads raw, but compact safe repository inventory commands such as `find`, `ls`, `rg --files`, `git ls-files`, and `fd`

library-side adapters can also use `runReduceJsonCli(...)` to call the CLI without rebuilding the child-process + JSON plumbing themselves.

repository inventory compaction is deliberately narrow. standalone inventory commands compact only when they are inventory-only, and pipelines only compact when every downstream segment is a structural stdin transform: `sort`, `head`, `tail`, or `uniq`. mixed command sequences, source commands that execute other commands such as `find ... -exec ...` or `fd --exec ...`, and pipelines such as `find ... | xargs wc -l`, `rg --files | rg TODO src`, or `git ls-files | jq -R .` stay raw.

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
tokenjuice install [codex|claude-code|codebuddy|cursor|pi]
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
