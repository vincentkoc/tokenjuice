# codebuddy integration design

## why codebuddy uses pre-tool-use wrapping

codebuddy exposes the same matcher-group hook surface as claude code (`hooks.PreToolUse` / `hooks.PostToolUse` in `~/.codebuddy/settings.json`), so the first prototype of this host mirrored tokenjuice's old Claude Code PostToolUse path: compact after execution and inject the reduced text back through hook output.

that shape works today, but codebuddy's own hook docs flag a problem:

> since the tool has already executed, blocking has no effect. the `decision: "block"` field is deprecated.

and even while it still works, codebuddy's ui renders every compacted result as `✘ Hook PostToolUse [blocked]` — which looks like an error for what is really a successful tool call plus an output rewrite.

so codebuddy uses the cursor pattern instead: a `PreToolUse` hook that routes the bash command through `tokenjuice wrap` before the shell ever runs it.

for codebuddy, tokenjuice installs a `PreToolUse` bash hook and rewrites:

```text
<original shell command>
```

to:

```text
tokenjuice wrap -- <host-shell> -lc '<original shell command>'
```

this is deliberate:

- `wrap` makes compacted output the actual tool result the agent reads. no `decision: "block"` response; no ui "blocked" label.
- host-shell `-lc` preserves shell semantics for complex command strings (quotes, pipes, redirects, `&&`, variables, etc.).
- tokenjuice resolves the host shell in this order: `tool_input.shell`, `TOKENJUICE_CODEBUDDY_SHELL`, `SHELL`, `bash`, then `sh`. the extra `bash` rung compared to cursor reflects codebuddy's bash-first default.
- if no usable shell is found, tokenjuice leaves the command unchanged (no pre-tool rewrite).

## settings file shape

codebuddy's `~/.codebuddy/settings.json` uses the claude-code matcher-group shape:

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/tokenjuice codebuddy-pre-tool-use --wrap-launcher /usr/local/bin/tokenjuice",
            "statusMessage": "wrapping bash through tokenjuice for compaction"
          }
        ]
      }
    ]
  }
}
```

a user's existing matcher groups under the same `Bash` key are preserved. `tokenjuice install codebuddy` prunes just the tokenjuice entry from each group instead of replacing the whole group, so unrelated handlers survive a reinstall.

## migrating from an older PostToolUse install

an earlier prototype of this host installed a `PostToolUse` hook with `statusMessage: "compacting bash output with tokenjuice"`. running `tokenjuice install codebuddy` detects legacy tokenjuice entries by that status message or by the `codebuddy-post-tool-use` subcommand string and strips them before writing the new `PreToolUse` entry. sibling hooks inside the same matcher group are preserved.

you do not need to uninstall first. running the current install command once is the migration.

## tradeoff and mitigation

wrapping with `<host-shell> -lc` means raw command shape becomes launcher-like (`<shell>`, `-lc`, `<cmd>`), which can reduce reducer matching quality if classification only sees outer argv.

tokenjuice mitigates this by normalizing wrapped input before classification:

- unwrap `bash|sh|zsh|fish -c/-lc '<cmd>'` to the nested command
- classify against the nested command/argv
- keep compound command safety behavior unchanged

this preserves reducer quality for codebuddy the same way it does for cursor.

## launcher behavior

codebuddy hooks store a `--wrap-launcher` value. when that launcher points to a `.js` entrypoint, tokenjuice executes it via node:

```text
node <launcher>.js wrap -- ...
```

this avoids linux/mac permission issues from trying to execute a `.js` file directly. `--local` installs use this node-dispatched shape; installs that find a `tokenjuice` binary on `PATH` use the binary directly.

## already-wrapped commands

if the user (or another tool) has already routed a command through `tokenjuice wrap` — for instance, to use `tokenjuice wrap --raw -- <cmd>` as an escape hatch — the pre-tool hook detects that and leaves the command unchanged instead of double-wrapping. the detection covers:

- bare `tokenjuice wrap ...`
- absolute-path `tokenjuice` launchers (`/usr/local/bin/tokenjuice`, pnpm shims, homebrew cellar paths, windows `.exe`/`.cmd`/`.bat` variants)
- node-dispatched local builds (`node /abs/dist/cli/main.js ... wrap ...`)

## trace and diagnostics

for debugging classifier decisions, use `--trace` with json output on the wrapped command directly:

```bash
node dist/cli/main.js wrap --format json --trace -- "$SHELL" -lc "git status --short"
```

inspect:

- `result.trace.normalizedCommand`
- `result.trace.normalizedArgv`
- `result.trace.matchedReducer`
- `result.trace.family`

## expected verification flow

```bash
pnpm build
node dist/cli/main.js install codebuddy
node dist/cli/main.js doctor codebuddy
node dist/cli/main.js uninstall codebuddy
node dist/cli/main.js wrap --format json --trace -- "$SHELL" -lc "git status --short"
node dist/cli/main.js wrap --format json --trace -- pnpm --help
node dist/cli/main.js wrap --format json --trace --raw -- pnpm --help
```

expected:

- `doctor codebuddy` reports `health: ok`
- the hook entry in `~/.codebuddy/settings.json` has `matcher: "Bash"` and a command containing `codebuddy-pre-tool-use --wrap-launcher ...`
- if CodeBuddy was already running when tokenjuice wrote the settings file, restart CodeBuddy or open `/hooks` and confirm the external settings change before expecting the hook to appear or fire in that session. CodeBuddy snapshots hook settings at startup and does not hot-load externally edited hooks.
- `uninstall codebuddy` removes tokenjuice-managed `PreToolUse` and legacy `PostToolUse` entries while preserving unrelated hooks
- wrapped shell commands show nested normalized command/argv in trace
- `--raw` keeps `ratio = 1`
- non-raw wraps usually produce `ratio < 1`

## runtime reload behavior

`tokenjuice install codebuddy` edits `~/.codebuddy/settings.json` from outside
CodeBuddy. CodeBuddy can read that file (`codebuddy config get hooks` shows the
installed `PreToolUse` entry), but an already-running session keeps the hook
snapshot it loaded at startup. This means `tokenjuice doctor codebuddy` can
report `health: ok` while the current CodeBuddy `/hooks` panel still does not
show the new tokenjuice entry.

After installing from another terminal, start a new CodeBuddy session. If you
intentionally edit hooks while a session is open, use `/hooks` to review and
accept the external settings change before relying on it.

## environment variables

| variable | effect |
| --- | --- |
| `CODEBUDDY_CONFIG_DIR` | settings directory, overrides `~/.codebuddy` |
| `CODEBUDDY_HOME` | legacy fallback for the same, kept for existing installs |
| `TOKENJUICE_CODEBUDDY_SHELL` | force a specific host shell (path or bare name) |
| `SHELL` | default host shell when `tool_input.shell` is absent |

## platform boundary

- supported: linux/macos, and codebuddy inside wsl
- not supported yet: native windows shell interception (`process.platform === "win32"`)

on native windows, the codebuddy pre-tool hook intentionally returns a deny response with `permissionDecisionReason` that asks users to run codebuddy in wsl. `tokenjuice doctor codebuddy` reports that state as `broken` (when an install exists) or `disabled` (when it does not) so users aren't silently left without compaction.
