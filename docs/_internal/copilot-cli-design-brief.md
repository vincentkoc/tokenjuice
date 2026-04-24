# Copilot CLI integration — design brief (internal, temporary)

> **Scope**: research notes for adding tokenjuice support to
> `github/copilot-cli`. Sits next to `copilot-integration-survey.md`.
> Delete when the integration lands and durable content has moved into
> `docs/`.
>
> **Source discipline**: facts below were verified by reading the
> on-disk CLI bundle at `~/.copilot/pkg/universal/1.0.34/app.js`
> (minified but searchable) plus `copilot-sdk/types.d.ts` via
> jcodemunch. Deep-wiki's earlier account was materially wrong about
> the post-tool hook surface and is not the source of truth here.

---

## 1. Bottom line

**Copilot CLI supports the full Claude-Code hook surface, including a
mutating `postToolUse` hook.** This is a straight post-tool
integration — same shape as our existing `claude-code` adapter, not
a cursor-style pre-tool wrap.

Consequences:

- Integration reuses the post-tool pattern; the `compactBashResult`
  core seam applies unchanged.
- Likely 80%+ code reuse with `src/hosts/claude-code/index.ts`; the
  real work is install-path resolution and doctor probes, not a new
  reducer path.
- Windows is supported out of the box (Copilot CLI ships Windows-first
  path handling). No WSL-only caveat like cursor.
- The Claude-compat file `.claude/settings.json` is read by Copilot
  CLI verbatim. Our existing claude-code hook may Just Work on
  Copilot CLI today without a dedicated adapter — smoke-test early.

---

## 2. Extension surface (verified from the on-disk bundle)

### 2.1 Hook events

Exact enum from the bundle (zod schema `u2t` + normalization map
`d2t`; see `app.js` symbols `u2t`, `c2t`, `d2t`, `bWr`):

| camelCase (canonical) | PascalCase (accepted) | Fires | Can mutate tool result? |
|---|---|---|---|
| `sessionStart` | `SessionStart` | new session | no; adds context |
| `sessionEnd` | `SessionEnd` | session end | no |
| `userPromptSubmitted` | `UserPromptSubmit` | user prompt accepted | no |
| `preToolUse` | `PreToolUse` | before tool exec | **yes** — allow/deny/modify/ask |
| `postToolUse` | `PostToolUse` | **after** tool exec | **yes** — modifiedResult / additionalContext / suppressOutput |
| `postToolUseFailure` | `PostToolUseFailure` | tool exec failed | yes — same shape as postToolUse |
| `errorOccurred` | `ErrorOccurred` | session error | no |
| `agentStop` | `Stop` | agent completion | yes — gate completion |
| `subagentStop` | `SubagentStop` | subagent completion | yes |
| `subagentStart` | (no alias) | subagent spawn | no |
| `preCompact` | `PreCompact` | before compaction | no |
| `permissionRequest` | (no alias) | permission prompt | yes |
| `notification` | (no alias) | notification emit | no |

PascalCase keys are normalized to camelCase at load time via the
`Qpe` function; both are valid in config files.

### 2.2 Hook entry schema (`QU = b1e.refine(A1e)`)

```jsonc
{
  // exactly one of these three is required:
  "command":    "...",   // cross-platform
  "bash":       "...",   // POSIX only
  "powershell": "...",   // Windows only
  "matcher":    "Bash",  // optional tool-name filter (string, min length 1)
  "timeout_sec": 30       // optional; field name not yet pinned
}
```

Zod rule: `A1e` asserts at least one of `bash`, `powershell`,
`command` is set, else the error `"At least one of 'bash',
'powershell', or 'command' must be specified"`.

Nested hooks deeper than one level are rejected. A parent-level
`matcher` is inherited by immediate children.

### 2.3 Top-level config schema (`u2t`)

```jsonc
{
  "version": 1,             // optional, literal 1
  "disableAllHooks": false, // optional kill switch
  "hooks": {
    "preToolUse":  [ /* HookEntry[] */ ],
    "postToolUse": [ /* HookEntry[] */ ]
    // ...other events listed in §2.1
  }
}
```

Settings schema `SWr` is `u2t` plus `companyAnnouncements`,
`enabledPlugins`, `extraKnownMarketplaces`.

### 2.4 Hook config load order (merged; later wins)

From `loadHooks(e,r,n,o,s,a,l)` in the bundle:

1. Repo: `.github/copilot/settings.json`, then
   `.github/copilot/settings.local.json`.
2. Claude-compat repo: `.claude/settings.json`, then
   `.claude/settings.local.json`.
3. User hooks dir: `$COPILOT_HOME/hooks/` (default
   `$HOME/.copilot/hooks/`). **Corrected 2026-04-23** from live capture +
   bundle re-read of `~/.copilot/pkg/universal/1.0.35/app.js` at
   `loadHooks`: `Fee(Oa(void 0,"config"),"hooks")` where
   `Oa(void 0, _)` returns `COPILOT_HOME ?? join(homedir(), ".copilot")`
   (the `"config"` string is passed but the function ignores its second
   arg). The earlier "`config/hooks/`" claim in this brief was wrong.
4. Installed plugins: each entry in `~/.copilot/config.json`
   `installedPlugins[]`, via `itr`:
   - plugin manifest's `hooks` field (inline object), OR
   - the path in `hooks` (string), OR
   - fallback `<plugin>/hooks.json` or `<plugin>/hooks/hooks.json`.

`disableAllHooks: true` at any level turns everything off.

### 2.5 SDK hook I/O contract (verified from `copilot-sdk/types.d.ts`)

```ts
interface PostToolUseHookInput extends BaseHookInput {
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}
interface PostToolUseHookOutput {
  modifiedResult?: ToolResultObject;
  additionalContext?: string;
  suppressOutput?: boolean;
}
type ToolResultObject = {
  textResultForLlm: string;
  binaryResultsForLlm?: ToolBinaryResult[];
  resultType: "success" | "failure" | "rejected" | "denied";
  error?: string;
  sessionLog?: string;
  toolTelemetry?: Record<string, unknown>;
};
```

For shell-style hooks (our path), the CLI spawns the configured
`command` with stdin = JSON of `PostToolUseHookInput` and reads the
hook's stdout as JSON matching `PostToolUseHookOutput` — this matches
the Claude Code shell-hook contract our existing adapter already
produces. **[verify at implementation]** the exact stdin/stdout
envelope wrapper used for shell hooks vs programmatic SDK hooks; the
two may differ slightly.

### 2.6 Environment variables the CLI reads

Confirmed by string search in the bundle:

- `COPILOT_HOME` — overrides `$HOME/.copilot`. Primary install-path
  override for our adapter.
- `COPILOT_CACHE_HOME`, `COPILOT_SDK_PATH`, `COPILOT_API_URL`,
  `COPILOT_API_TOKEN`.
- Plugin execution context injects: `COPILOT_PLUGIN_ROOT`,
  `COPILOT_PLUGIN_DATA`, `COPILOT_PROJECT_DIR`, plus Claude aliases
  `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`.

### 2.7 Installed plugins pointer

`~/.copilot/config.json` carries the authoritative list in
`installedPlugins[]`; each entry has `cache_path` pointing at the
plugin dir under `~/.copilot/installed-plugins/<marketplace>/<name>/`.

---

## 3. Proposed integration architecture

### 3.1 Mode: post-tool hook (claude-code pattern)

- **Host slug: `copilot-cli`** (decided). Matches kebab-case
  product-scoped convention. Paired with `vscode-copilot` for the
  VS Code Copilot Chat adapter.
- Host adapter: `src/hosts/copilot-cli/index.ts`.
- Runtime entry: reuse the post-tool reducer path — the hook shell
  command invokes `tokenjuice` in post-tool mode, feeding the bash
  result through `compactBashResult`.
- Matcher set to the shell-tool name so we only rewrite shell output.
  **Live-verified 2026-04-23**: matcher `"shell"` fires on CLI
  payloads whose tool-name field is the literal string `"bash"`. So
  matcher values are tool *categories/aliases*, NOT strict equality
  against the tool-name field. Use `"shell"` for the CLI adapter.
- **Wire format (live-captured 2026-04-23 via `tee` trace on CLI
  1.0.35)**: the PostToolUse stdin payload is **camelCase**:
  `toolName`, `toolArgs` (object with `command`, `timeout`, `intent`,
  `language`), `toolResult` (object with `resultType`,
  `textResultForLlm`), plus `sessionId`, `timestamp`, `cwd`. An
  earlier captured fixture used snake_case (`tool_name`,
  `tool_input`, `tool_result`, `result_type`, `text_result_for_llm`)
  — that shape still exists in the brief and the Zod schema (some
  CLI versions or IDE hosts may send snake_case), so the adapter
  reads **both** and emits **both** key variants inside
  `modifiedResult`. See
  [test/hosts/fixtures/copilot-cli-posttool-live.json](../../test/hosts/fixtures/copilot-cli-posttool-live.json)
  for the live shape and
  [test/hosts/fixtures/copilot-cli-posttool.json](../../test/hosts/fixtures/copilot-cli-posttool.json)
  for the snake_case fallback. Note the key is `toolResult` (object),
  distinct from VS Code's `tool_response` (string) — see the VS Code
  brief.
- Env vars to snapshot in tests: `COPILOT_HOME`, `HOME`, `PATH`,
  `SHELL`, `process.platform`.

### 3.2 Install surface

Decision point: where we write the hook entry.

- **Option A — canonical**: user settings file at
  `$COPILOT_HOME/config.json` (fall back to `$HOME/.copilot/config.json`)
  under `hooks.postToolUse`. Need to confirm the user-level settings
  file actually parses `hooks`; §2.4 only names repo-level
  `.github/copilot/settings.json`. Source search required.
- **Option B — dedicated hooks file**: write to
  `$COPILOT_HOME/hooks/hooks.json` with the full hook payload.
  Matches §2.4 item 3 directly; minimal risk of clobbering other
  user config.
- **Option C — Claude-compat**: piggy-back on the claude-code
  adapter's `.claude/settings.json` output. Zero new code, but
  coupled to per-repo presence and not the canonical Copilot path.

**Recommendation**: Option B. Dedicated file, Copilot-specific load
path, clean idempotent install.

**Env-var handling**: Copilot CLI honours `$COPILOT_HOME` and
tokenjuice's install/doctor must do the same (resolve `$COPILOT_HOME`
first, fall back to `$HOME/.copilot`).

**Cross-host shared-file finding (2026-04-23, live)**: with `COPILOT_HOME`
unset, the CLI and VS Code Copilot Chat **both read the same
user-level hook file** `$HOME/.copilot/hooks/hooks.json` (or any
`*.json` under `$HOME/.copilot/hooks/`). Verified live: a PostToolUse
entry installed under that path fired on both surfaces (CLI payload
got `tool_name: "bash"`; VS Code payload got
`tool_name: "run_in_terminal"`).

This creates a **trampling hazard**: a naive writer that overwrites
the whole file on install will remove the sibling host's entries.
The shared hook-file helper (see closing note below) MUST:

1. Parse-merge-preserve, never truncate.
2. Tag each tokenjuice entry with a distinct, stable marker
   identifying the owning host (e.g. a comment-safe sentinel field
   or a dedicated filename — see next point).
3. Prefer writing to a **per-host filename** inside the shared dir
   (VS Code scans every `*.json` there; CLI merges all files under
   `$COPILOT_HOME/hooks/`). Proposed: CLI writes
   `$COPILOT_HOME/hooks/tokenjuice-cli.json`, VS Code writes
   `$HOME/.copilot/hooks/tokenjuice-vscode.json`. Both contain a
   subset of the full tokenjuice hook payload and cannot stomp each
   other.

**When `COPILOT_HOME` IS set**: CLI follows it; VS Code does NOT
(verified: VS Code reads `~/.copilot/hooks/` via
`pathService.userHome()` with no `COPILOT_HOME` branch). In that
case the two install targets diverge and the adapters must write to
two different absolute dirs.

**User-setup guidance (ship in docs once this lands)**: future
`docs/copilot-integration.md` (or equivalent) must spell out all of
the above for end users, specifically:

- That VS Code Copilot Chat and Copilot CLI share `~/.copilot/hooks/`
  by default and hand-edited files will be read by both.
- That `tokenjuice install copilot-cli` and
  `tokenjuice install vscode-copilot` each write their own file in
  that dir and are safe to run together.
- That hand-rolled hooks should use a per-host filename (never
  `hooks.json`) to avoid clobbering our installs or each other's.
- That `COPILOT_HOME` only redirects the CLI; running both surfaces
  with `COPILOT_HOME` set is supported but requires both installs
  to be re-run after the env change.

**Shared-code note**: factor the JSON hook-file serializer, parser,
and idempotent-merge logic into a new helper
**`src/hosts/shared/hooks-json-file.ts`** (alongside the existing
`src/hosts/shared/hook-command.ts`). The VS Code adapter will
consume the same helper with a different target-path function. Build
this adapter first, harvest the helper, then wire VS Code on top.
Helper must accept a **filename** parameter (not just a dir) so the
two adapters can write `tokenjuice-cli.json` / `tokenjuice-vscode.json`
side-by-side in the shared dir — see the shared-file trampling
finding above.

Standard adapter surface:

- `tokenjuice install copilot-cli` — write/merge postToolUse entry.
- `tokenjuice uninstall copilot-cli` — remove tokenjuice entry.
- `tokenjuice doctor copilot-cli` — resolve install dir, read hooks
  config, compare against current expected command, return
  `disabled | warn | broken | ok`.
- Update hardcoded host list in `src/cli/main.ts` and usage strings.
- Add to aggregate doctor in `hosts/shared/hook-doctor.ts`.

### 3.3 Doctor

1. Resolve install root via `COPILOT_HOME` or `$HOME/.copilot`.
2. Load `hooks/tokenjuice-cli.json` (preferred) and scan any other
   `hooks/*.json` for stray tokenjuice entries from older installs.
3. Locate the tokenjuice `postToolUse` entry and compare command
   string to current expected value (reuse
   `hosts/shared/hook-command.ts`).
4. Check binary existence on disk.
5. Honour `disableAllHooks` at the settings level — surface as
   `disabled` status.

### 3.4 Ship-as-plugin option

A later option: publish a Copilot plugin under
`~/.copilot/installed-plugins/tokenjuice/tokenjuice/` with a manifest
that sets `hooks` inline or points at a bundled `hooks.json`. Defer
to v2; dedicated-file install is simpler for v1 and has no
distribution plumbing cost.

### 3.5 What to leave out of v1

- `preToolUse` integration — not needed once we have post-tool.
- MCP server integration — no observable win.
- `preCompact` — orthogonal to our contract.
- Plugin manifest — deferred (§3.4).

---

## 4. Resolved vs remaining unknowns

Previously listed unknowns, now resolved:

- Hook events available → full Claude-Code set including
  `postToolUse`, `postToolUseFailure`. See §2.1.
- Hook entry schema → `command` / `bash` / `powershell` plus
  optional `matcher`. See §2.2.
- Config load order → §2.4.
- `COPILOT_HOME` is a real env var; default `$HOME/.copilot`.

Remaining, to resolve during implementation:

1. ~~Exact user-level settings file name for hooks~~ — **resolved
   2026-04-23**: any `*.json` under `$COPILOT_HOME/hooks/` is loaded
   and merged (see §2.4 item 3 corrected).
2. ~~Canonical shell-tool name(s) to use as `matcher`~~ —
   **resolved 2026-04-23**: use `"shell"`; it matches `tool_name:
   "bash"` (matcher is a category/alias).
3. ~~Shell-hook stdin/stdout envelope~~ — **resolved** for stdin;
   see [test/hosts/fixtures/copilot-cli-posttool.json](../../test/hosts/fixtures/copilot-cli-posttool.json).
   Stdout envelope still to pin empirically during impl.
4. Whether `tokenjuice` binary invoked from a Windows-native Copilot
   CLI session works without shell shims. First platform-specific
   test target.

---

## 5. Implementation plan

Follow the `tokenjuice-new-host` skill checklist. Phase ordering:

1. **Confirm remaining §4 unknowns** via a focused bundle read + one
   live smoke test with a hand-written `hooks.json`.
2. **Smoke-test Claude-compat path** — our existing claude-code
   adapter already writes a `.claude/settings.json` matching §2.4
   item 2; verify Copilot CLI consumes it unchanged. If yes, this
   becomes the zero-cost MVP while a dedicated adapter follows.
3. **Adapter scaffold**: `src/hosts/copilot-cli/index.ts` with
   `installCopilotCliHooks`, `uninstallCopilotCliHooks`,
   `doctorCopilotCliHooks`. Factor shared logic out of the
   claude-code adapter as needed.
4. **CLI wiring**: `install | uninstall | doctor copilot-cli` in
   `src/cli/main.ts`; update hardcoded host list and usage strings.
5. **Aggregate doctor**: add to `hosts/shared/hook-doctor.ts`;
   tighten aggregate tests with a temp `COPILOT_HOME`.
6. **Tests**: `test/hosts/copilot-cli.test.ts` covering install
   idempotency, key preservation, the doctor status matrix, and the
   post-tool reducer invocation. Snapshot/restore `COPILOT_HOME`,
   `HOME`, `PATH`, `SHELL`, `process.platform`.
7. **Docs**: README host list, `docs/spec.md` supported-hosts table,
   promote stabilized sections of this brief into a public
   `docs/copilot-cli-integration.md`.
8. **Release**: bump version per `AGENTS.md` §Release Process.

---

## 6. Test coverage (required)

New suite `test/hosts/copilot-cli.test.ts` must cover every row
below. Follow the env-snapshot pattern in
[test/hosts/claude-code.test.ts](../../test/hosts/claude-code.test.ts).
Snapshot and restore: `COPILOT_HOME`, `HOME`, `PATH`, `SHELL`,
`process.platform`. Use temp dirs for all file paths; never read
real `~/.copilot`.

### Install

- Writes `$COPILOT_HOME/hooks/tokenjuice-cli.json` with a PostToolUse
  entry whose `matcher` is `"shell"` and whose command invokes the
  resolved-absolute `tokenjuice` binary.
- Honours `$COPILOT_HOME`; falls back to `$HOME/.copilot` when unset.
- Idempotent: running install twice produces byte-identical output
  (modulo atomic-write temp files).
- Preserves hand-added sibling entries in the same file (merge, do
  not truncate).
- Preserves unrelated top-level keys (`version`, `disableAllHooks`,
  other event arrays like `preToolUse`).
- Creates `hooks/` dir if missing.

### Coexistence with VS Code adapter (critical)

- Pre-seed `~/.copilot/hooks/tokenjuice-vscode.json` with the VS Code
  adapter's expected content. Run `installCopilotCliHooks`. Assert:
  (a) the VS Code file is byte-identical afterwards, (b) the CLI
  file is written correctly, (c) subsequent `doctor copilot-cli`
  returns `ok`, (d) subsequent `doctor vscode-copilot` returns `ok`.
- Pre-seed a hand-rolled `~/.copilot/hooks/hooks.json` with an
  unrelated PostToolUse entry. Run install. Assert the hand-rolled
  file is untouched.

### Uninstall

- Removes the tokenjuice entry from `tokenjuice-cli.json`.
- Deletes the file iff it becomes empty; leaves it otherwise.
- No-op when nothing is installed.
- Does **not** touch sibling files (`tokenjuice-vscode.json`,
  `hooks.json`, user-authored files).

### Doctor

Return every status from `disabled | warn | broken | ok`:
- `ok`: file exists, entry matches expected command, binary exists.
- `warn`: installed command string drifted (e.g. old binary path).
- `broken`: entry present but referenced binary missing on disk.
- `disabled`: `disableAllHooks: true` set at any level (file-level or
  inherited).
- Migration path: legacy `hooks.json`-style install detected → doctor
  reports the migration hint instead of `ok`.

### Runtime (PostToolUse hook)

Feed [test/hosts/fixtures/copilot-cli-posttool.json](../../test/hosts/fixtures/copilot-cli-posttool.json)
into the runtime subcommand and assert:
- Rewrites `tool_result.text_result_for_llm` via `compactBashResult`.
- Emits valid `PostToolUseHookOutput` JSON on stdout
  (`{ modifiedResult: { ... } }`).
- Skip path: `tool_name !== "bash"` (or matcher miss) → empty JSON
  object `{}` on stdout; exit code 0; no errors.
- Raw-mode bypass: `TOKENJUICE_RAW` or equivalent → no rewrite.
- Defensive parse: malformed JSON stdin → exit 0 with empty output,
  no throw.
- `result_type: "failure" | "rejected" | "denied"` payloads pass
  through untouched (we rewrite only success output).

### Aggregate doctor

- `doctorInstalledHooks` includes `copilot-cli` in the output.
- Existing aggregate tests do not leak real `$COPILOT_HOME` (pin to
  temp dir in setup).

### CLI wiring

- `install copilot-cli`, `uninstall copilot-cli`, `doctor copilot-cli`
  all wired in `src/cli/main.ts`.
- `tokenjuice --help` usage text lists the new host.
- Hardcoded install-target list in `src/cli/main.ts` includes
  `copilot-cli`.

### Regression gate

```bash
pnpm typecheck
pnpm exec vitest run test/hosts/copilot-cli.test.ts
pnpm exec vitest run test/hosts/claude-code.test.ts test/hosts/codex.test.ts test/hosts/pi.test.ts
pnpm verify
```

Manual smoke: install into a temp `COPILOT_HOME`, start a real CLI
session, run one `echo hi`, confirm PostToolUse output is compacted.

---

## 7. Definition of Done

All items must be true before handoff. Map directly to the skill's
review checklist plus host-specific items.

### Code

- [ ] `src/hosts/copilot-cli/index.ts` exports
      `installCopilotCliHooks`, `uninstallCopilotCliHooks`,
      `doctorCopilotCliHooks`, and a runtime entry.
- [ ] Runtime calls `compactBashResult` — no reducer logic
      duplicated in the adapter.
- [ ] Install is atomic (temp-file + rename) and idempotent.
- [ ] Install writes per-host filename `tokenjuice-cli.json` (never
      generic `hooks.json`).
- [ ] Shared helper `src/hosts/shared/hooks-json-file.ts` created;
      accepts a filename param; claude-code adapter optionally
      migrated to use it (stretch, not required).
- [ ] Runtime emits `PostToolUseHookOutput`-shaped JSON; matcher-miss
      returns `{}`; bad-input returns `{}` without throwing.

### Wiring

- [ ] `src/cli/main.ts`: `install`, `uninstall`, `doctor` branches +
      usage text + hardcoded host list all updated.
- [ ] `src/index.ts`: all three surface functions + runtime + types
      re-exported.
- [ ] `src/hosts/shared/hook-doctor.ts`: host added to aggregate.

### Tests

- [ ] `test/hosts/copilot-cli.test.ts` covers every row in §6 above.
- [ ] Fixture [copilot-cli-posttool.json](../../test/hosts/fixtures/copilot-cli-posttool.json)
      drives at least the runtime happy-path and matcher-skip tests.
- [ ] Coexistence test with VS Code adapter passes (install one,
      assert the other is untouched).
- [ ] Aggregate doctor test updated; does not leak real
      `$COPILOT_HOME`.
- [ ] `pnpm verify` passes locally.

### Docs

- [ ] [README.md](../../README.md) host list + support table updated.
- [ ] [docs/spec.md](../../docs/spec.md) supported-hosts table
      updated.
- [ ] [docs/integration-playbook.md](../../docs/integration-playbook.md)
      env-var list updated to include `COPILOT_HOME`.
- [ ] Public `docs/copilot-cli-integration.md` created with the
      user-setup guidance from §3.2 (shared-file trampling warning).
- [ ] `docs/_internal/copilot-cli-design-brief.md` deleted once the
      VS Code brief is also shipped (both briefs leave together).

### Release

- [ ] Version bumped per [AGENTS.md](../../AGENTS.md) §Release Process.
- [ ] `pnpm release:local` green.

