# OpenHands integration

OpenHands support is beta.

`tokenjuice install openhands` writes a project-local `PostToolUse` hook into
`.openhands/hooks.json` for the `terminal` tool. When OpenHands returns noisy
shell output, tokenjuice compacts it and injects the compacted result as
additional context with the raw-output escape hatch:

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install openhands
tokenjuice doctor openhands
```

For repo-local verification during development:

```bash
pnpm build
node dist/cli/main.js install openhands --local
node dist/cli/main.js doctor openhands --local
```

## Behavior

- Only `PostToolUse` payloads for `terminal` are considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.
- The hook is project-local because OpenHands reads `.openhands/hooks.json` from
  the workspace.

## Current beta caveat

OpenHands `PostToolUse` hooks cannot block or replace the original tool result.
This integration injects compacted context alongside the original output instead
of suppressing the raw result. That makes the first cut useful for model-facing
summary context, but duplicate raw output can still appear until OpenHands has a
post-tool replacement surface.
