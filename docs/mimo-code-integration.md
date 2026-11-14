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
The source package version is 0.1.17; this is not a published-version claim.

Unit and installed-file tests cover lifecycle, object exports, coherent output,
and failure/raw/exact-read preservation. Native discovery and the next model
request remain unqualified. Before relying on automatic savings, verify a fresh
isolated MiMo session with a successful noisy command, exact read, raw bypass,
and failing command, then inspect the bytes in its next model request.
