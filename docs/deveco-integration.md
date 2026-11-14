# DevEco Code integration

`tokenjuice install deveco` installs a beta native plugin for DevEco Code's
`tool.execute.after` hook. It replaces eligible Bash output after execution.

```sh
tokenjuice install deveco
tokenjuice doctor deveco
tokenjuice uninstall deveco
```

The default file is `~/.config/deveco/plugins/tokenjuice.js`, or
`$XDG_CONFIG_HOME/deveco/plugins/tokenjuice.js`. Set `DEVECO_CONFIG_DIR` to the
absolute configuration directory to use a different location. The library API
also accepts `configDir`. Restart DevEco Code after installation or removal.
The installer changes only its marked plugin file; it refuses foreign files,
symlinks, directories and multiply linked files, and backs up changed owned files.

## Contract and limits

The [official source repository](https://gitcode.com/openharmony-sig/deveco-code)
and [Huawei configuration guide](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-deveco-code-common-configure/)
identify DevEco Code. The audited source is mirrored at
[`b45c586a6b671cfa2bce51d3b00dd65cf93d1303`](https://github.com/AgentGear/deveco-code/tree/b45c586a6b671cfa2bce51d3b00dd65cf93d1303).
Its `packages/opencode/src/config/plugin.ts` scans flat `plugin` and `plugins`
JavaScript/TypeScript files. `packages/opencode/src/session/tools.ts` awaits
mutable `tool.execute.after` hooks before returning their output.
`packages/opencode/src/tool/shell/id.ts` retains the `bash` ID, and `shell.ts`
returns `metadata.exit`, `metadata.truncated` and `output`.

Only `bash` results with `metadata.exit === 0` and
`metadata.truncated === false` are eligible. Failures, missing/unknown status,
interrupted execution, truncated output and unrelated tools pass through. The
plugin uses the shared compactor, retains native result metadata, and fails open
if compaction throws. Exact reads and `tokenjuice wrap --raw -- <command>` keep
their output. No upstream output file is read to expand a truncated result.

Doctor checks the installed file, not native discovery or model consumption.
Unit and CLI tests cover the source contract and lifecycle.

## Native acceptance blocker

The published macOS package `@deveco/deveco-code@0.3.0-stable` was tested with a
fresh, isolated HOME, configuration directory and workspace. Its version and
headless `run --help` commands work. A headless run configured for a local
OpenAI-compatible model endpoint exits with status 1 before sending any request
to that endpoint. The native error requires review of the product agreements
through DevEco Code or `deveco auth consent` before continuing.

No agreements were accepted, credentials supplied or consent state bypassed.
This proves a consent prerequisite; it does not establish that a custom provider
requires Huawei authentication. The package's `stable` tag resolves to
`0.3.0-stable`; its `latest` tag resolved to the older `0.2.5` during this check.

The owner must review and accept the vendor agreements through the native
`deveco auth consent` flow in the isolated test environment before qualification
can continue. Plugin loading, released-binary compatibility, model-visible
compaction, exact/raw preservation, complete failed output and uninstall remain
unqualified. A successful doctor report does not clear this acceptance gate.
