# GitHub Copilot CLI integration

`tokenjuice install copilot-cli` wires a **PostToolUse** hook that
deterministically compacts shell output before the Copilot CLI agent
sees it. Output that would otherwise consume thousands of tokens on
verbose install logs, `find` listings, test dumps, etc. becomes a
short summary plus a `[tokenjuice] ...` footer that explicitly
instructs the agent not to retry for the omitted content.

## How it is installed

- Hooks file: `$COPILOT_HOME/hooks/tokenjuice-cli.json`
  (defaults to `$HOME/.copilot/hooks/tokenjuice-cli.json`).
- Event: `postToolUse`.
- Matcher: `"shell"` (the Copilot CLI categorises `toolName: "bash"`
  under this matcher alias).
- Command: invokes the resolved-absolute `tokenjuice` binary with the
  `copilot-cli-post-tool-use` subcommand.
- Payload compatibility: the runtime accepts both camelCase (live
  Copilot CLI 1.0.35 wire format) and snake_case keys, and emits
  both on the way back out so either parser accepts the response.

Install is atomic (temp-file + rename) and idempotent. Unrelated
top-level keys (`version`, `disableAllHooks`) and sibling
`postToolUse` entries are preserved. Re-running install produces
byte-identical output.

### Skip paths

The runtime emits `{}` (no rewrite) for any of:

- non-bash tool invocations
- empty or missing `tool_result` / command
- non-`success` result types (`failure`, `rejected`, `denied` pass
  through untouched so the agent still sees raw error context)
- commands already wrapped with `tokenjuice wrap --raw --` /
  `--full` (explicit bypass)
- malformed JSON stdin

## Shared hooks dir hazard (read this if you also use VS Code Copilot Chat)

Both the Copilot CLI and VS Code Copilot Chat scan **every**
`*.json` file under `~/.copilot/hooks/` and union the entries. If
you install tokenjuice into both hosts:

- `tokenjuice install copilot-cli` writes `tokenjuice-cli.json`.
- `tokenjuice install vscode-copilot` writes `tokenjuice-vscode.json`.

These **never overwrite each other** — they land in separate files
under the same directory by design. Do not hand-edit either file to
merge them, and do not add a `tokenjuice.json` (unsuffixed) next to
them. `tokenjuice doctor copilot-cli` reports stray sibling files
that contain a tokenjuice entry so duplicate installations are
caught early.

When `COPILOT_HOME` is set, only the Copilot CLI adapter respects
it. VS Code Copilot Chat ignores `COPILOT_HOME` and always resolves
`$HOME/.copilot/hooks/`. Setting `COPILOT_HOME` to split the two
hosts into different dirs is supported but unusual; the per-host
filename scheme above is the recommended path.

## Doctor

```bash
tokenjuice doctor copilot-cli
tokenjuice doctor copilot-cli --print-instructions
```

Status values: `ok` (installed, correct, binary resolves) ·
`warn` (installed command drifted, e.g. old binary path) ·
`broken` (installed but referenced binary is missing) ·
`disabled` (no file, file sets `disableAllHooks: true`, or no
tokenjuice entry present).

The `--print-instructions` mode emits a markdown snippet you should
paste into `.github/copilot-instructions.md` or `AGENTS.md`. It
teaches the agent to trust compacted output and reserve
`tokenjuice wrap --raw --` for the narrow cases where raw bytes are
genuinely required.

## Uninstall

```bash
tokenjuice uninstall copilot-cli
```

Removes only the tokenjuice entry from `tokenjuice-cli.json`;
deletes the file iff it becomes empty. Sibling files
(`tokenjuice-vscode.json`, hand-authored `hooks.json`, etc.) are
never touched.

## Config envelope

Environment variables read by this adapter:

- `COPILOT_HOME` — hooks dir root; default `$HOME/.copilot`.
- `TOKENJUICE_COPILOT_CLI_MAX_INLINE_CHARS` — positive integer
  override for the inline-text cap used during compaction.
- `TOKENJUICE_COPILOT_CLI_STORE` — when truthy (`1`, `true`, `yes`),
  stores raw output for later retrieval through the artifacts
  subsystem.
