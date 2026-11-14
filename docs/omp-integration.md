# oh-my-pi (omp) integration

Tokenjuice provides an OMP native package extension. OMP loads the bundled
JavaScript entry from `package.json#omp.extensions`; no Pi-directory alias or
separate `tokenjuice install omp` command is involved.

## Install and remove

After this integration is included in a published Tokenjuice version:

```sh
omp plugin install tokenjuice
omp plugin list
omp plugin doctor
```

Start a fresh session and inspect `/extensions` for the Tokenjuice module.
For a source checkout, build Tokenjuice and use `omp plugin link /path/to/tokenjuice`.
The package manager validates declared extension entries when installing.

Use the host-owned lifecycle to disable, restore, or remove it:

```sh
omp plugin disable tokenjuice
omp plugin enable tokenjuice
omp plugin uninstall tokenjuice
```

OMP owns plugin scope, profiles, dependency resolution and enablement. Installing
this package does not edit the provider, model or permission settings. Native
project extensions use `<cwd>/.omp/extensions`; user extensions use the active
profile's agent directory. This integration uses the package manager instead of
copying files to either location.

## Behavior and limits

The extension handles native `tool_result` events for successful foreground
`bash` calls. It replaces one text block only when the shared reducer admits
compaction and the final replacement, including its raw-artifact notice, is
shorter. Custom fields on that text block survive. The extension does not return
`details` or `isError`, so OMP retains its original trace and execution metadata.

Failed results, missing success metadata, background jobs, truncated or already
minimized output, images, multiple content blocks, timeout-adjustment notices,
wall-time notices, native replies and Spotlight output remain unchanged.
Exact file reads and explicit wrapping also remain unchanged:

```sh
tokenjuice wrap --raw -- git status
```

Errors inside Tokenjuice fail open to the original result. OMP still owns command
execution and approval. Native replay traces remain untouched; no savings claim
includes them.

## Verification status

The design references were inspected at source revision
`dafe7eebfc2af04661f5edf4c86f19e61429c9df`. Acceptance uses the published OMP
18.20.0 package rather than assuming current source matches that binary:

- [Native package installation and manifest loading](https://github.com/can1357/oh-my-pi/blob/dafe7eebfc2af04661f5edf4c86f19e61429c9df/docs/plugin-manager-installer-plumbing.md)
- [Extension loading and profile paths](https://github.com/can1357/oh-my-pi/blob/dafe7eebfc2af04661f5edf4c86f19e61429c9df/docs/extension-loading.md)
- [Result replacement in the native wrapper](https://github.com/can1357/oh-my-pi/blob/dafe7eebfc2af04661f5edf4c86f19e61429c9df/packages/coding-agent/src/extensibility/extensions/wrapper.ts)
- [Bash completion, notices and failure metadata](https://github.com/can1357/oh-my-pi/blob/dafe7eebfc2af04661f5edf4c86f19e61429c9df/packages/coding-agent/src/tools/bash.ts)

`test/hosts/omp.test.ts` checks handler registration, replacement shape,
unmodified native metadata, raw/exact bypass, failure and background handling,
and package declaration. These are adapter contracts, not native acceptance.

### Native session acceptance

```sh
pnpm build
node scripts/omp-e2e.mjs /path/to/bun /path/to/omp/dist/cli.js
```

The fixture uses OMP 18.20.0 and Bun 1.4.4, isolated HOME/agent configuration
and a loopback OpenAI-compatible model endpoint. It exercises the real plugin
manager's link, list, doctor, disable, enable and uninstall operations. Five fresh
sessions compare baseline, installed, disabled, re-enabled and uninstalled states.
Each session executes a noisy listing, an exact CRLF read, explicit raw bypass,
and complete 80-line failure output with stderr and exit code 7.

Assertions inspect the subsequent model requests. Native observer extensions
also compare each result before and after Tokenjuice, require a real replay trace,
and verify unchanged metadata, failure flags, exact/raw bytes and failed output.
The observers do not replace tools or modify results. OMP's own shell minimizer
is disabled in the disposable fixture to keep its output reduction separate.

This passes on macOS arm64 with the pinned native host/runtime and on Linux x64
against the standard package build in [native CI](https://github.com/vincentkoc/tokenjuice/actions/runs/43573866426/job/132384027141). Other versions,
remote providers, interactive permission modes and desktop sessions remain
unqualified. No account credentials or paid model are used. 18.20.0 is a tested
version, not a claimed minimum.
