# Empryo / SoulForge integration

Empryo's current runtime and package are named SoulForge (`@proxysoul/soulforge`).
Install a project-local native `PreToolUse` hook:

```bash
tokenjuice install empryo
tokenjuice doctor empryo
```

`soulforge` is an alias for the same installer, doctor and removal commands.
The installer writes `.soulforge/config.json` in the current directory and keeps
unrelated settings and hooks. Run it from the directory where SoulForge starts.
It does not modify the old `.empryo` directory or inherited Claude settings.

The hook rewrites `Bash` input using `tokenjuice wrap --keep-failures -- sh -c`.
SoulForge maps its internal `shell` tool to `Bash`. The adapter preserves other
input fields, including `cwd` and `timeout`, and does not return a permission
decision. Explicit `tokenjuice wrap`, including `--raw`, is left unchanged.
Native Windows uses a different shell; automatic wrapping is limited to POSIX
hosts and WSL.

## Activation and removal

Start a fresh `soulforge` or `sf` session and inspect `/hooks` after installing.
SoulForge merges hooks from user/project Claude files and user/project
`.soulforge/config.json`. Any loaded `disableAllHooks: true` disables all hooks.
The doctor checks that switch and the configured launcher; it does not establish
session activation or model-visible savings.

```bash
tokenjuice uninstall empryo
```

Removal deletes only this adapter's entries. Settings symlinks and permissions
are preserved. Existing configurations receive a backup before mutation.

## Contract and verification limits

The implementation follows upstream source at
[`c27dac1`](https://github.com/proxysoul/Empryo/tree/c27dac116d2ee1637abfc6634bebf08b5c379454),
whose package reports version `2.20.25`:

- [Hook protocol](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/mintlify-docs/tools/hooks.mdx)
- [Loader and merged config paths](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/src/core/hooks/loader.ts)
- [Input rewrite consumer](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/src/core/tools/index.ts)

Tests cover installation, removal, symlink and custom-content preservation,
disable switches, native payloads, raw bypass and the shared shell wrapper.
No real SoulForge session has been qualified. Its own output compression,
approval checks and subsequent model requests still need baseline/installed
comparison for long output, exact reads, raw bypass and failing commands.
`--keep-failures` preserves failures at the tokenjuice boundary; it cannot
disable downstream host truncation or compression.
