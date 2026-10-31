# VS Code Copilot Chat integration

This adapter targets the older **Local** harness. Current VS Code also offers a
**Copilot** harness with a separate hook contract; selecting a model does not
select a harness. Do not treat this Local installer as a verified Copilot-harness
integration. See [VS Code hook configuration](https://code.visualstudio.com/docs/agent-customization/hooks)
for discovery and migration rules.

`tokenjuice install vscode-copilot` wires a **PreToolUse** hook that
wraps every `runTerminalCommand` command Copilot Chat asks VS Code to
execute. The wrapped command routes through `tokenjuice wrap`,
which runs the original command, captures its output, and emits a
compacted version plus a `[tokenjuice] ...` footer to the model.

This remains a pre-tool wrap (like the Cursor adapter). VS Code now
also exposes `PostToolUse` hooks that can add context after a tool
finishes, but that path would leave the full raw terminal output in
the conversation. The adapter intercepts at the command level so the
terminal result itself is compacted.

## Preconditions

The Local harness in **VS Code Stable** and **VS Code Insiders** uses a
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
- Event: `PreToolUse`.
- Matcher: `"runTerminalCommand|run_in_terminal"` to keep the VS Code
  hook from waking up in unrelated Copilot CLI sessions that share the
  same hooks directory. The tokenjuice command also checks the payload
  tool name and still accepts the legacy `run_in_terminal` name.
- Command: `tokenjuice vscode-copilot-pre-tool-use
  --wrap-launcher <path>`, invoked with the `PreToolUse` payload on
  stdin.

Install is atomic and idempotent. A legacy `tokenjuice.json`
(unsuffixed, written by pre-1.0 snapshots) is auto-migrated to
`tokenjuice-vscode.json` on the next install.

### Transform semantics

On a matching `runTerminalCommand` call, the adapter rewrites the
`tool_input.command` field to:

```
tokenjuice wrap --keep-failures --source vscode-copilot -- <shell> -lc '<original command>'
```

where `<shell>` is `$SHELL` on POSIX (falling back to `sh`) or
`powershell -Command` on Windows. **Sibling `tool_input` fields
(`explanation`, `goal`, `mode`, `timeout`) are preserved** — VS Code
silently drops tool-input updates that fail schema validation, so
any regression that strips them would silently disable the hook.

### Skip paths

The adapter emits `{}` (no rewrite) for any of:

- non-terminal tools
- empty or missing command
- commands already wrapped with `tokenjuice wrap ...`
- commands explicitly bypassing with `tokenjuice wrap --raw --` /
  `--full`
- malformed JSON or non-object stdin (including `null`)

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

## Verification boundary

Installed-hook child-process contracts check real installer commands, complete
failed stdout/stderr and exit 7, exact reads, malformed/non-object payloads and
absolute raw-wrapper bypass. Shared wrapper detection recognizes the executable
path and Node subcommand position. These checks do not establish desktop
conversation acceptance. Qualify the selected harness in a fresh trusted
workspace and inspect the next model request.
