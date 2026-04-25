# VS Code Copilot Chat integration

`tokenjuice install vscode-copilot` wires a **PreToolUse** hook that
wraps every `run_in_terminal` command Copilot Chat asks VS Code to
execute. The wrapped command routes through `tokenjuice wrap`,
which runs the original command, captures its output, and emits a
compacted version plus a `[tokenjuice] ...` footer to the model.

This is a pre-tool wrap (like the Cursor adapter), not a post-tool
output rewrite. VS Code Copilot Chat does not currently expose a
hook that can modify tool output after the fact, so the adapter
intercepts at the command level.

## Preconditions

Both **VS Code Stable** and **VS Code Insiders** are supported by a
single `tokenjuice install vscode-copilot`. Both editions read the
same `~/.copilot/hooks/` directory, so one install covers both and
uninstall removes the hook from both in the same step.

Two VS Code settings are required before the hook will fire; the
adapter cannot verify them from outside the editor, and
`tokenjuice doctor vscode-copilot` prints an advisory reminding you
of both:

- **`chat.useHooks`** must be enabled. Default `true` since VS Code
  1.109; organisations with the enterprise policy
  `chat_preview_features_enabled === false` force it off.
- **The workspace must be trusted.** Hooks do not fire under
  workspace-trust-disabled mode.

If neither is set, installation will succeed silently but the hook
will never run.

## How it is installed

- Hooks file: `$HOME/.copilot/hooks/tokenjuice-vscode.json`
  (`COPILOT_HOME` is **ignored** — VS Code Copilot Chat always
  resolves under the OS home directory via `pathService.userHome()`).
- Event: `preToolUse`.
- Matcher: `"run_in_terminal"` (strict string match).
- Command: `tokenjuice vscode-copilot-pre-tool-use
  --wrap-launcher <path>`, invoked with the `PreToolUse` payload on
  stdin.

Install is atomic and idempotent. A legacy `tokenjuice.json`
(unsuffixed, written by pre-1.0 snapshots) is auto-migrated to
`tokenjuice-vscode.json` on the next install.

### Transform semantics

On a matching `run_in_terminal` call, the adapter rewrites the
`tool_input.command` field to:

```
tokenjuice wrap -- <shell> -lc '<original command>'
```

where `<shell>` is `$SHELL` on POSIX (falling back to `sh`) or
`powershell -Command` on Windows. **Sibling `tool_input` fields
(`explanation`, `goal`, `mode`, `timeout`) are preserved** — VS Code
silently drops tool-input updates that fail schema validation, so
any regression that strips them would silently disable the hook.

### Skip paths

The adapter emits `{}` (no rewrite) for any of:

- non-`run_in_terminal` tools
- empty or missing command
- commands already wrapped with `tokenjuice wrap ...`
- commands explicitly bypassing with `tokenjuice wrap --raw --` /
  `--full`
- malformed JSON stdin

## Shared hooks dir hazard (read this if you also use Copilot CLI)

Both VS Code Copilot Chat and the Copilot CLI scan **every**
`*.json` file under `~/.copilot/hooks/` and union the entries. If
you install tokenjuice into both hosts:

- `tokenjuice install vscode-copilot` writes `tokenjuice-vscode.json`.
- `tokenjuice install copilot-cli` writes `tokenjuice-cli.json`.

These **never overwrite each other** — they land in separate files
under the same directory by design. Do not hand-edit either file to
merge them, and do not add a `tokenjuice.json` (unsuffixed) next to
them. `tokenjuice doctor vscode-copilot` reports stray sibling
files that contain a tokenjuice entry.

When `COPILOT_HOME` is set, only the Copilot CLI adapter respects
it. VS Code always resolves `$HOME/.copilot/hooks/`, so the two
adapters may diverge in that scenario and the per-host filenames
still apply.

## Doctor

```bash
tokenjuice doctor vscode-copilot
tokenjuice doctor vscode-copilot --print-instructions
```

Status values: `ok` (installed, correct, binary resolves) ·
`warn` (installed command drifted) ·
`broken` (installed but referenced binary missing) ·
`disabled` (no file, `disableAllHooks: true`, or no tokenjuice
entry). Doctor output always includes the `chat.useHooks` +
workspace-trust advisory.

The `--print-instructions` mode emits a markdown snippet for
`.github/copilot-instructions.md` or `AGENTS.md` that teaches the
model to trust compacted output and reserve
`tokenjuice wrap --raw --` for cases where raw bytes are required.

## Uninstall

```bash
tokenjuice uninstall vscode-copilot
```

Removes only the tokenjuice entry from `tokenjuice-vscode.json`;
deletes the file iff it becomes empty. Sibling files are never
touched.

## Config envelope

Environment variables read by this adapter:

- `HOME` — hooks dir root (via `os.homedir()`).
- `SHELL` — wrapped-shell selection on POSIX; falls back to `sh`.
- `process.platform` — drives the POSIX vs Windows wrapper branch.

`COPILOT_HOME` is intentionally **not** read by this adapter.
