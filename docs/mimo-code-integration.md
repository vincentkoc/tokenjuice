# MiMo Code integration

MiMo Code can load a native `tool.execute.after` file hook. Tokenjuice compacts
successful Bash output in that hook and leaves the host's exit status intact.

```sh
tokenjuice install mimo-code
tokenjuice doctor mimo-code
tokenjuice uninstall mimo-code
```

Restart MiMo Code after installation. The installer owns only
`hooks/tokenjuice.js`, preserves other hooks and refuses to replace an unmarked
file. The path is resolved in this order:

1. `MIMOCODE_CONFIG_DIR/hooks/tokenjuice.js`.
2. `MIMOCODE_HOME/config/hooks/tokenjuice.js` (`MIMOCODE_HOME` must be absolute).
3. `$XDG_CONFIG_HOME/mimocode/hooks/tokenjuice.js`, or
   `~/.config/mimocode/hooks/tokenjuice.js` by default.

The hook exports an object, as MiMo's file loader requires. It does not use
OpenCode's plugin initializer. Node-based embedded MiMo runtimes restrict hooks
to `MIMOCODE_CONFIG_DIR`; installing into the ordinary XDG directory does not
establish loading in those runtimes. Desktop and embedded contexts need their
own acceptance check.

## Output contract

Only `bash` results with numeric `metadata.exit === 0` and
`metadata.truncated === false` are eligible. Failed, truncated or unknown-status
results stay unchanged, including MiMo's full-output pointer. Exact file reads,
inventories and explicit `tokenjuice wrap --raw -- ...` stay unchanged. MiMo owns
the session working directory, so this adapter does not infer it from the
Tokenjuice process. It updates the output and metadata preview together and
retains unrelated metadata. Compactor errors leave the result unchanged.

## Verification boundary

The API and discovery paths were checked against
[MiMo Code source at 5a538cb](https://github.com/XiaomiMiMo/MiMo-Code/tree/5a538cb4f97b9c4c8eb09a845ec06c1e5f1f3e8f):
[file hook loader](https://github.com/XiaomiMiMo/MiMo-Code/blob/5a538cb4f97b9c4c8eb09a845ec06c1e5f1f3e8f/packages/cli/src/plugin/index.ts),
[Bash result metadata](https://github.com/XiaomiMiMo/MiMo-Code/blob/5a538cb4f97b9c4c8eb09a845ec06c1e5f1f3e8f/packages/cli/src/tool/bash.ts),
and [config paths](https://github.com/XiaomiMiMo/MiMo-Code/blob/5a538cb4f97b9c4c8eb09a845ec06c1e5f1f3e8f/packages/shared/src/global.ts).
Unit and installed-file tests cover lifecycle, object exports, coherent output,
and failure/raw/exact-read preservation.

## Native acceptance

```sh
pnpm build
node scripts/mimo-e2e.mjs /path/to/mimo
```

The [native fixture](../scripts/mimo-e2e.mjs) passed with the official
**MiMo Code 0.1.17 Linux x64** executable in
[CI](https://github.com/vincentkoc/tokenjuice/actions/runs/43574059537/job/132384593948).
CI checks the release archive's SHA-256 before execution. Baseline, installed
and uninstalled sessions use an isolated home, config directory and Git
workspace, with fixed Bash calls from a loopback OpenAI-compatible endpoint.
No real credentials or user settings are used. The fixture enables Bash
permission for its fixed commands in the disposable workspace.

The installed hook shortens Git status containing 80 modified files in the
next model request. Exact reads retain CRLF and trailing blank lines;
inventory and explicit raw output match the unhooked baseline. All 160 failure
lines, stderr and exit status 7 remain intact. Native JSON events must agree
with the model-visible output and metadata. After uninstall, a fresh session
returns the baseline output and an unrelated custom hook remains unchanged.

This qualifies native file discovery and result delivery for the pinned CLI
and local provider route. Other versions, platforms, desktop/embedded contexts,
remote providers and interactive permission modes need separate acceptance.
