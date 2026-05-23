# Qwen Code integration

Qwen Code support is beta.

`tokenjuice install qwen-code` writes a project-local `PostToolUse` command hook
into `.qwen/settings.json`. The hook matches Qwen Code shell tools
(`Bash`, `Shell`, and `run_shell_command`) and injects compacted context when
shell output is noisy.

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install qwen-code
tokenjuice doctor qwen-code
```

For repo-local verification during development:

```bash
pnpm build
QWEN_PROJECT_DIR=$(mktemp -d)
QWEN_PROJECT_DIR=$QWEN_PROJECT_DIR node dist/cli/main.js install qwen-code --local
QWEN_PROJECT_DIR=$QWEN_PROJECT_DIR node dist/cli/main.js doctor qwen-code --local
```

## Behavior

- Only `PostToolUse` payloads for shell tool names are considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.
- Existing `.qwen/settings.json` keys and unrelated hooks are preserved.
- `QWEN_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Qwen Code `PostToolUse` hooks support adding context after tool execution. This
integration does not suppress or replace the original shell result; it adds a
compacted context block so Qwen can prefer the smaller view without losing access
to the host-owned output path.
