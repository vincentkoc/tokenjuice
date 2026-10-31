# host integration playbook

this document is the implementation checklist for adding a new host integration (like codex, claude-code, codebuddy, cursor, pi).

## when to use this

use this before opening a PR that adds `tokenjuice install <host>` or any new hook/adapter path.

## design decisions first

define the host hook model before writing code:

- can the host rewrite shell input before execution?
- can the host replace shell output after execution?
- are hooks file-based, extension-based, or api-based?
- does the host return plain text, structured json, or both?

pick one integration mode:

- post-tool compaction (preferred when shell output can be replaced safely)
- pre-tool command wrapping (use `tokenjuice wrap` when post replacement is unavailable)
- instruction or skill guidance (when the documented host surface cannot rewrite commands/results)
- provider configuration or migration guidance (when the product delegates execution or has retired)

for pre-tool wrapping, preserve shell semantics (for example `bash -lc '<cmd>'`) and ensure classification normalization can recover the nested command.

## implementation checklist

for a new host adapter in `src/hosts/<host>/index.ts`:

- install flow
  - write/update host config atomically
  - preserve unrelated keys
  - keep installation idempotent (replace prior tokenjuice entry, keep non-tokenjuice entries)
- doctor flow
  - detect disabled / warn / broken / ok states
  - validate expected command against installed command
  - report missing executable paths
  - return a single repair command
- runtime hook flow
  - parse hook payload defensively
  - skip non-target tools/events early
  - preserve explicit raw bypass behavior
  - never throw hard on hook input parse failures

then wire CLI + exports:

- `src/cli/install-commands.ts`, `src/cli/uninstall-commands.ts`, `src/cli/doctor-commands.ts`
  - add a handler for `install <host>`, `uninstall <host>`, and `doctor <host>`
  - register it (and any alias) in `installCommands`, `uninstallCommands`, and `doctorCommands`
- `src/cli/main.ts`
  - the "currently supports" host lists in `runInstall` / `runUninstall`
  - usage text
  - runtime hook entry command if needed
- `test/cli/host-commands.test.ts`
  - add the host (and aliases) to `HOST_TARGETS` and record its transcript with `pnpm exec vitest run test/cli/host-commands.test.ts -u`
- `src/index.ts`
  - runtime/install/doctor exports
  - result/report type exports
- `src/hosts/shared/hook-doctor.ts`
  - add the host to aggregate doctor report

### symlinked settings

Claude Code, CodeBuddy, and Droid update the resolved settings file while preserving
its symlink and permissions. Broken links must have their target restored before
installing. The writer checks for changed contents or a retargeted link before
replacing the file and asks you to retry when it detects another edit. Avoid editing
settings concurrently with install or uninstall: portable filesystem rename cannot
make that check and replacement atomic against another writer.

## test strategy (required)

add host-specific tests and aggregate tests:

- `test/hosts/<host>.test.ts`
  - install idempotency
  - preserve unrelated config fields
  - doctor status matrix (`disabled`, `warn`, `broken`, `ok`)
  - runtime behavior (rewrite/skip/bypass paths)
- aggregate coverage
  - update tests for `doctorInstalledHooks` if the new host is included there

## critical test isolation rules

new adapters often fail CI/local due to leaked machine config. isolate host homes explicitly:

- set and reset host env vars in each suite (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `CLAUDE_HOME`, `CURSOR_HOME`, `PI_CODING_AGENT_DIR`, `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `COPILOT_HOME`, `TOKENJUICE_CLAUDE_CODE_SHELL`, `TOKENJUICE_CURSOR_SHELL`, `SHELL`, etc.)
- `COPILOT_HOME` affects **copilot-cli only**; VS Code Copilot Chat ignores it and always resolves under `$HOME/.copilot/hooks/`. If your adapter should not depend on `COPILOT_HOME`, add an explicit test that sets it to a decoy path and asserts the install does not land there.
- avoid reading real `~/.<host>` in tests
- use temp dirs for all config paths
- restore `PATH` after each test

### shared hook dirs (hazard)

copilot-cli and vscode-copilot both read every `*.json` under `~/.copilot/hooks/`. install each host under a per-host filename (`tokenjuice-cli.json` and `tokenjuice-vscode.json`) so neither host's install overwrites the other. doctor for both hosts scans sibling files and reports stray tokenjuice entries.

if you add a new host to aggregate doctor logic, existing aggregate tests may start failing unless they set that host's env home to temp storage.

### shared Codex hooks renderer

when `codex-hooks` is executable on `PATH`, the Codex installer registers the
top-level `{"hooks": ...}` fragment as `tokenjuice.post-tool-use` and leaves the
effective `hooks.json` write to that renderer. uninstall unregisters the same
integration id. install and uninstall both provide the detected legacy
Tokenjuice group as an owned-source manifest so the renderer can adopt or
remove pre-fragment standalone state. without the renderer, Tokenjuice can update a regular
standalone hooks file with a source-content check; it refuses to replace an
externally owned symlink.

standalone install and uninstall remove only Tokenjuice commands from a matcher
group and preserve nested custom commands. the shared renderer currently owns
whole groups, so Tokenjuice rejects a mixed Tokenjuice/custom group before
invoking it; split those commands into distinct matcher groups and retry.

## regression gates before merge

minimum gate for a new host adapter:

```bash
pnpm typecheck
pnpm vitest run test/hosts/<host>.test.ts
pnpm vitest run test/hosts/codex.test.ts test/hosts/claude-code.test.ts test/hosts/codebuddy.test.ts test/hosts/cursor.test.ts test/hosts/pi.test.ts
```

if you changed normalization/classification paths, also run:

```bash
pnpm vitest run test/core/command.test.ts test/core/classify.test.ts test/core/trace.test.ts
```

## manual verification flow

run from repo root:

```bash
pnpm build
node dist/cli/main.js install <host>
node dist/cli/main.js doctor <host>
```

for command-path diagnostics, use trace:

```bash
node dist/cli/main.js wrap --format json --trace -- bash -lc "git status --short"
```

verify:

- normalized command/argv match expected command intent
- matched reducer is specific (not generic fallback for common commands)
- raw mode preserves full output:

```bash
node dist/cli/main.js wrap --format json --trace --raw -- <command>
```

for truncation-related debugging, verify both boundaries explicitly:

- reducer truncation: if output includes `... omitted ...` / `... lines omitted ...`, rerun with `--raw` first.
- capture truncation: if output includes `[tokenjuice: output truncated]`, rerun with a larger capture ceiling (for example `--max-capture-bytes 52428800`).
- do not treat these as the same failure mode; reducer bypass and capture-size tuning solve different problems.

## docs updates required in same PR

when adding a host integration, update:

- `README.md` command examples and support table
- `docs/spec.md` supported host hooks table
- dedicated design doc if host behavior differs materially (like cursor pre-tool wrapping)

## installed hook contracts and live acceptance

Run `pnpm test:hook-contracts` on Linux, macOS, or WSL. CI runs this script after
building the package. It installs into disposable homes, reads the generated
hook commands, invokes them through a shell, and executes rewritten commands.
No host CLI, model account, or developer config is required.

Coverage: Codex post-tool feedback and fail-open limits; Claude Code, CodeBuddy,
Cursor, and VS Code Copilot pre-tool listing compaction, exact reads, stderr and
exit status, repeat invocation, malformed input, and uninstall.

These are installed-hook integration contracts. Payloads are synthetic; they do
not prove that a host discovers the config, invokes a hook, accepts a rewrite,
or delivers compacted output to the model. The former `e2e:local` command was
renamed to `test:hook-contracts` to reflect that boundary.

Live acceptance must use a real host session in an isolated home/workspace and
record the host version, command, observed hook invocation, and model-visible
output. Check raw bypass and failing commands too. Instruction/skill integrations
also need evidence that the host loads the file and uses `tokenjuice wrap`.
Record missing credentials or unavailable hosts as unverified; a passing doctor
or a generated config snapshot cannot substitute for this evidence.

### Qwen Code session acceptance

`node scripts/qwen-e2e.mjs /path/to/qwen` runs Qwen Code with a disposable trusted
home/workspace and a loopback OpenAI-compatible endpoint. CI pins 0.26.4. The real
host executes shell commands in baseline and installed sessions, then sends their
results to the model endpoint. Assertions cover listing compaction, exact reads,
raw bypass, failure output, and native failure flags and exit status. Qwen Code
trims edge whitespace; exact reads must match the baseline host result. Raw
results must match the entire baseline result.

The fixture uses native `--allowed-tools run_shell_command` in its disposable
project. The hook supplies only `updatedInput` and leaves permission policy to
Qwen Code. Reinstalling migrates tokenjuice's legacy context-only `PostToolUse`
entries to `PreToolUse` wrapping. No remote model credentials are passed through;
remote provider availability and model reasoning quality remain outside this test.

### OpenCode session acceptance

`node scripts/opencode-e2e.mjs /path/to/opencode` runs the real host with an
installed plugin and disposable home/workspace. CI pins OpenCode 1.19.5. A
loopback OpenAI-compatible fixture endpoint requests real bash commands and
checks the tool results in the host's next model request: listing compaction,
exact file bytes, raw bypass, and failing-command output and exit status.
The host model endpoint is local; no model credentials are passed through.
OpenCode may install its own plugin SDK dependencies during startup.

This test covers host discovery, plugin initialization, shell execution, and
model-visible delivery. It does not validate remote model-provider availability
or model reasoning quality. The exported plugin must be an async initializer,
as described in the [OpenCode plugin contract](https://opencode.ai/docs/plugins/).
Reinstall and restart OpenCode after upgrading from an installation that exported
an unsupported `{ id, setup }` object; doctor reports that older format as a warning.

### Pi session acceptance

`node scripts/pi-e2e.mjs /path/to/pi` runs Pi with an installed extension and a
disposable home/workspace. A JavaScript CLI entry path is also accepted. CI pins
`@earendil-works/pi-coding-agent@1.4.0` and passes its `dist/bundle/cli.js` entry.
A loopback OpenAI-compatible fixture requests real bash commands and checks the
results in Pi's next model request: listing compaction, exact file bytes, raw
bypass, and failure output and exit status. A listing exceeding Pi's output
limit also verifies that the extension reads the host's full-output file before
compacting, preserving entries omitted from the visible tool result.

The test uses automatic extension discovery and the real bash tool. Pi runs
offline with a local model endpoint and isolated settings; no model credentials
are passed through. This validates host loading and model-visible delivery,
including Pi's failure flag, rather than remote provider availability or model
reasoning quality.

### Claude Code session acceptance

`node scripts/claude-e2e.mjs /path/to/claude` runs the native CLI with a disposable
home/workspace and a loopback Anthropic-compatible endpoint. CI pins Claude Code
2.1.316 through `@anthropic-ai/claude-code-linux-x64`. No account credentials are
passed through; nonessential host traffic and automatic updates are disabled.

The test runs a native session before installing tokenjuice, then installs the
pre-tool hook and starts a second session. Both sessions execute real Bash tools.
The endpoint checks results in subsequent model requests: the installed hook
must compact a listing, preserve the host's native exact-read and raw-bypass
results, and retain failing-command stdout, stderr, exit status, and error flag.
Claude trims edge whitespace and can add context reminders to its Bash results,
so exact reads are compared with the unhooked baseline rather than file bytes.
`wrap` adds its own exit marker on failures; the test checks the host's failure
status and command output instead of requiring identical error formatting.

This validates settings discovery, hook execution, command rewriting, and
model-visible delivery. It does not validate remote provider availability or
model reasoning quality.

### CodeBuddy session acceptance

`node scripts/codebuddy-e2e.mjs /path/to/codebuddy` runs two real CLI sessions in
an isolated home/workspace, before and after installing tokenjuice. CI pins
`@tencent-ai/codebuddy-code@2.179.0`. A custom model in `models.json` points to a
loopback OpenAI-compatible endpoint; no account credentials are passed through.
Telemetry, error reporting, automatic updates, and the built-in marketplace are
disabled for the fixture.

The endpoint requests real Bash commands and checks their results in subsequent
model requests: listing compaction, exact file bytes, raw bypass, and failing
command output and exit status. The script also checks native exit/failure
metadata in the CLI event stream. CodeBuddy wraps stdout/stderr/status in text
and appends a reminder when a hook changes input; exact reads are checked inside
the native stdout envelope, while raw results match the unhooked baseline.

The installed hook returns `hookSpecificOutput.updatedInput`; the pinned CLI
silently ignores `modifiedInput`. Permission decisions remain with CodeBuddy.
This validates config discovery, hook execution, command rewriting, and
model-visible delivery, rather than remote provider availability or reasoning.

### Droid session acceptance

`node scripts/droid-e2e.mjs /path/to/droid` runs the native CLI in a disposable
home/workspace. CI pins `droid@1.1.0`. A custom model in `settings.json` points
to a loopback OpenAI-compatible endpoint; no account credentials are passed
through. Automatic updates are disabled and `DO_NOT_TRACK` is set.

The endpoint requests real Execute commands before and after hook installation
and checks results in subsequent model requests: listing compaction, exact
file bytes including whitespace, raw bypass, and failing-command stdout,
stderr and exit status. Native tool events must retain their success/error
flags and agree with the results delivered to the model. Droid appends a
process-exit marker; the exact-read assertion keeps that native envelope.

The fixture also checks that Low autonomy rejects the rewritten command before
execution. Droid 1.1.0 requires High autonomy for this input rewrite, so the
installed session uses `--auto high` with only fixed disposable-fixture
commands. The hook does not grant permission and the fixture does not disable
host permission checks. This validates config discovery, hook execution,
command rewriting and model-visible delivery; remote provider availability
and model reasoning remain outside this fixture.

## qualify the support claim

Use [adapter support and verification](adapter-support-matrix.md) to distinguish
file validation, installed-process contracts and real-host/model-request proof.
A managed file passing doctor does not establish host discovery or execution.
Preserve structured values, status, stderr, downstream policy decisions and raw
escape hatches. If a host returns structured output and content projections,
update both coherently or leave the result unchanged.

For skill-only products, use documented discovery paths or manual import. Probe
dependencies inside the actual tool environment; do not infer a cloud or VM PATH
from the desktop. Keep personal import separate from marketplace publication.
For versioned plugin APIs, qualify each API and loader separately.
