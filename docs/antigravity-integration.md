# Antigravity integration

`tokenjuice install antigravity` installs a workspace rule at `.agents/rules/tokenjuice.md`.

The rule tells Google Antigravity IDE and CLI (`agy`) agents to use `tokenjuice wrap -- <command>` for terminal commands likely to produce long output, and to use `tokenjuice wrap --raw -- <command>` only when exact raw bytes are needed.

This is a beta, guidance-only integration. Antigravity's hook payloads do not provide a stable terminal-output replacement path, so tokenjuice does not install a fake output-compaction hook. The documented workspace rules surface is the useful integration point for both the IDE and `agy`.

## Commands

```bash
tokenjuice install antigravity
tokenjuice doctor antigravity
tokenjuice uninstall antigravity
```

`tokenjuice install antigravity` resolves the nearest git root before writing `.agents/rules/tokenjuice.md`. Set `ANTIGRAVITY_PROJECT_DIR=/path/to/workspace` to override the target workspace explicitly.

## Verification

```bash
tokenjuice doctor antigravity
tokenjuice doctor hooks
```

`doctor antigravity` reports `ok` when the workspace rule exists, is marked `activation: always_on`, includes tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest the full-output escape hatch.
