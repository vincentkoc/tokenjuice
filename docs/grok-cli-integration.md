# Grok CLI integration

Grok CLI support is beta.

`tokenjuice install grok-cli` writes a user-level `PostToolUse` command hook
into `~/.grok/user-settings.json`. Grok CLI loads hooks only from user settings,
so tokenjuice does not install hooks into the repo-local `.grok/settings.json`.

The hook matches the `bash` tool and injects compacted context when shell output
is noisy:

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install grok-cli
tokenjuice doctor grok-cli
```

For repo-local verification during development:

```bash
pnpm build
HOME=$(mktemp -d)
HOME=$HOME node dist/cli/main.js install grok-cli --local
HOME=$HOME node dist/cli/main.js doctor grok-cli --local
```

## Behavior

- Only successful `PostToolUse` payloads for Grok CLI's `bash` tool are
  considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.
- Existing `~/.grok/user-settings.json` keys and unrelated hooks are preserved.

## Current beta caveat

Grok CLI `PostToolUse` hooks expose `additionalContext`. This integration does
not suppress or replace the original shell result; it adds a compacted context
block so Grok can prefer the smaller view without losing access to the
host-owned output path.
