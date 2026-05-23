# Command Code integration

Command Code support is beta.

`tokenjuice install command-code` writes a `PostToolUse` command hook into
`~/.commandcode/settings.json`. Set `COMMANDCODE_PROJECT_DIR=/path/to/project`
to install into that project's `.commandcode/settings.json` instead. The hook
matches the `shell` tool matcher and injects compacted context when shell output
is noisy.

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install command-code
tokenjuice doctor command-code
tokenjuice uninstall command-code
```

For repo-local verification during development:

```bash
pnpm build
COMMANDCODE_HOME=$(mktemp -d)/.commandcode
COMMANDCODE_HOME=$COMMANDCODE_HOME node dist/cli/main.js install command-code --local
COMMANDCODE_HOME=$COMMANDCODE_HOME node dist/cli/main.js doctor command-code --local
```

## Behavior

- Only `PostToolUse` payloads for Command Code shell tools are considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.
- Existing Command Code settings and unrelated hooks are preserved.
- `COMMANDCODE_HOME` can override the user config root for tests and scripted
  installs.
- `COMMANDCODE_PROJECT_DIR` can override the project root and takes precedence
  over `COMMANDCODE_HOME`.
- `TOKENJUICE_COMMAND_CODE_MAX_INLINE_CHARS` can cap the injected compacted
  context size.

## Current beta caveat

Command Code `PostToolUse` hooks support adding model-visible context after tool
execution. This integration does not suppress or replace the original shell
result; it adds a compacted context block so Command Code can prefer the smaller
view without losing access to the host-owned output path.
