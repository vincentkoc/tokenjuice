# Kimi integration

Kimi support is beta.

`tokenjuice install kimi` appends a marker-delimited `[[hooks]]` block to
`~/.kimi/config.toml`. The hook runs on Kimi Code CLI `PostToolUse` events for
the `Shell` tool and prints compacted tokenjuice context to stdout. Kimi adds
non-empty hook stdout to the agent context, so the original Shell result remains
available while tokenjuice provides a smaller authoritative summary.

## Install

```bash
tokenjuice install kimi
tokenjuice doctor kimi
tokenjuice uninstall kimi
```

Set `KIMI_SHARE_DIR=/path/to/.kimi` to override the config directory. `KIMI_HOME`
is still accepted as a legacy fallback. Use `tokenjuice install kimi --local`
when validating a repo-local tokenjuice build.

## Behavior

- The hook matches `PostToolUse` for Kimi's `Shell` tool.
- The hook compacts noisy terminal output and writes only the compacted context
  back to stdout.
- The hook is fail-open: malformed payloads, uninteresting output, or internal
  errors produce no stdout and exit successfully.
- Existing `config.toml` content is preserved and backed up before install.
- If `config.json` exists but `config.toml` does not, install refuses to create
  a TOML file. Start Kimi once to let it migrate the JSON config, then rerun
  `tokenjuice install kimi`.

## Current beta caveat

Kimi hooks are documented as beta. This integration does not suppress the
original Shell result; it adds compacted context alongside it.
