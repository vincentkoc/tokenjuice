# Cline integration

Cline support is beta.

`tokenjuice install cline` writes a global hook script to
`~/Documents/Cline/Hooks/tokenjuice-post-tool-use`. After install, enable that
script as a `PostToolUse` hook in Cline's Hooks tab. When Cline returns noisy
`execute_command` output, tokenjuice compacts it and returns the compacted result
through `contextModification` with the raw-output escape hatch:

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install cline
tokenjuice doctor cline
```

For repo-local verification during development:

```bash
pnpm build
node dist/cli/main.js install cline --local
node dist/cli/main.js doctor cline --local
```

## Behavior

- Only `PostToolUse` payloads for `execute_command` are considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.
- `CLINE_HOOKS_DIR` can override the global hooks directory for testing.

## Current beta caveat

Cline discovers hook scripts from the Hooks tab and macOS/Linux hooks must be
enabled there after install. This first cut injects compacted context through
`contextModification`; it does not suppress the original tool result.
