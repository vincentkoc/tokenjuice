# GitHub Copilot CLI integration

`tokenjuice install copilot-cli` wires a **PostToolUse** hook that
deterministically compacts shell output before the Copilot CLI agent
sees it. Output that would otherwise consume thousands of tokens on
verbose install logs, `find` listings, test dumps, etc. becomes a
short summary with the native shell completion footer preserved.

## How it is installed

- Hooks file: `$COPILOT_HOME/hooks/tokenjuice-cli.json`
  (defaults to `$HOME/.copilot/hooks/tokenjuice-cli.json`).
- Event: `postToolUse`.
- Matcher: `"bash"`. Native matchers are anchored regular expressions against
  the tool name; `"shell"` does not match `bash`. Reinstall to migrate the old
  matcher; doctor warns when it remains installed.
- Command: invokes the resolved-absolute `tokenjuice` binary with the
  `copilot-cli-post-tool-use` subcommand.
- Payload compatibility: the runtime accepts the documented camelCase
  `toolArgs`/`toolResult` envelope and its PascalCase-event snake_case equivalent.
  It returns canonical `modifiedResult.resultType` and `textResultForLlm` fields.

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
- missing, running, unrecognized or nonzero shell completion status
- commands already wrapped with `tokenjuice wrap --raw --` /
  `--full` (explicit bypass)
- malformed JSON stdin

Copilot CLI 1.0.105 marks completed Bash invocations as `resultType: "success"`
even when their shell command exits 7. Tokenjuice therefore also requires the
host's final completion footer to prove exit 0. It removes that footer before
counting and reducing command output, then appends it unchanged. The earlier
`<exited with exit code 0>` footer remains supported. Unknown formats stay raw.

See GitHub's [hook reference](https://docs.github.com/en/copilot/reference/hooks-reference)
for input/output envelopes and native matcher semantics.

## Native acceptance

```bash
pnpm build
node scripts/copilot-cli-e2e.mjs /path/to/copilot
```

The fixture runs native **1.0.105** in baseline and installed-hook sessions, with
a disposable home/project and a loopback Chat Completions endpoint. Custom
provider configuration plus `COPILOT_OFFLINE=true` avoids real credentials and
GitHub model routing. Built-in MCP servers and custom instructions are disabled;
the fixture grants tool execution and access to the Node and test CLI directories.

It captures the next model request for all 80 listing entries, an exact read,
explicit wrapping, raw bypass and a large failed command. Installed hooks must
run and shorten the listing to **80 matches**, excluding the native status
footer from the count. Read, wrapped, raw and failed results must match baseline.
All 80 failure lines, stderr, the exit-7 footer and numeric CLI exit metadata
must survive. A disposable hook receipt records the actual input and forwarded
hook output; direct calls with invented payloads do not establish acceptance.

This host trims leading and trailing whitespace before appending its completion
footer, so exact reads are qualified against native baseline rather than original
file bytes. Other versions, remote provider availability, interactive permissions
and sandbox execution remain unqualified. CI pins the Linux host separately from
the macOS development run.

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
