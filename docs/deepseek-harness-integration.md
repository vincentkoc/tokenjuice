# DeepSeek Harness integration

The native runtime plugin listens to Cordis `tools/post-execute` and replaces
the model-facing content of successful foreground `bash` results. It compacts
stdout while preserving stderr and leaves canonical values unchanged. It does
not change approvals, command arguments or execution status.

The contract is pinned to DeepSeek Harness `0.2.2-alpha.2`, source revision
`ce7073d51254c26cd63b22a60835b8f948deb447`:
[post-execute waterfall](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/src/events.ts),
[decision types](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/src/contracts.ts),
[Bash rendering](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/shell/tool-bash/src/render.ts).

## Preserved outcomes

The plugin delegates to downstream policies first. Blocks, content/value
replacements and policy errors remain authoritative; additional contexts are
retained. Compaction errors accept the original result.

Nonzero exits, infrastructure failures, timeouts, cancellation, stopped jobs,
background/promoted jobs, truncated streams, sandbox denials and unfamiliar
projections remain intact. Exact file reads and explicit
`tokenjuice wrap --raw -- <command>` bypass compaction.

## Native and PTC modes

Native mode consumes the content projection. PTC scripts consume canonical
values such as `result.stdout.text`; changing those values could break parsers.
The plugin therefore skips PTC sub-dispatches. In PTC workflows, explicitly run
`tokenjuice wrap -- <command>` for output intended for model consumption and use
`--raw` for exact data. Do not count this plugin as transparent PTC compaction.

## Build and activate a profile bundle

`pnpm build` creates a self-contained plugin package at
`dist/hosts/deepseek-harness/bundle`, also included in the tokenjuice npm package.
It contains `index.js`, a package manifest and the Cordis insertion patch.
Its `engines.dsh` pins the qualified source contract to `0.2.2-alpha.2`.
Other Harness versions need separate qualification.

From a tokenjuice source checkout:

```sh
pnpm build
dsh plugin --profile PROFILE add "$(pwd)/dist/hosts/deepseek-harness/bundle"
dsh --profile PROFILE --dump-config
```

Replace `PROFILE` with the profile used by your Harness session. For an npm global
installation, locate the bundle under
`$(npm root -g)/tokenjuice/dist/hosts/deepseek-harness/bundle` instead.
Keep the bundle path available while the profile links it. Quit the desktop app
before changing its profile and start a fresh session afterward.

Use the native plugin manager to remove it:

```sh
dsh plugin --profile PROFILE remove tokenjuice-deepseek-harness
```

The [official bundle publishing contract](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.md)
requires `dsh.bundle.patch`; a plain dependency alone does not activate a plugin.
Do not edit the profile manifest by hand. Inspect the dumped configuration for the
`tokenjuice-deepseek-harness` insertion, then verify a successful noisy Bash command
and an exact raw command in a fresh native session. Profile loading and actual
model-visible execution remain unqualified; the isolated bundle contract checks
packaging and callback behavior without claiming vendor activation.
