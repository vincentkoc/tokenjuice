# Goose integration

Goose support is beta.

`tokenjuice install goose` inserts a marker-delimited hints block into
`.goosehints` at the workspace root. Goose loads `.goosehints` as project
context, so this gives the agent stable guidance for using tokenjuice when it
runs terminal commands.

## Install

```bash
tokenjuice install goose
tokenjuice doctor goose
```

Restart the Goose session after installing or changing `.goosehints` so Goose
loads the updated hints. Enable Goose's Developer extension, which supplies
hint-file loading. By default Goose reads both `AGENTS.md` and `.goosehints`.
A custom `CONTEXT_FILE_NAMES` JSON array replaces that filename list; include
`.goosehints`, for example `CONTEXT_FILE_NAMES='["AGENTS.md", ".goosehints"]'`.
Doctor warns about incompatible values visible in its own environment. Run it
with the same setting as Goose; it cannot inspect a separately launched desktop
process or confirm the Developer extension is enabled.
[Goose hint configuration](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-goosehints.md)

## Behavior

- The hints block tells Goose to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The hints block tells Goose to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.goosehints` content is backed up before install and preserved
  around the tokenjuice block.

## Current beta caveat

Goose hints are prompt guidance, not command hooks. Goose has lifecycle hooks,
but this integration does not rely on them because the documented hooks surface
does not guarantee shell output replacement. It gives Goose a stable project
hint to follow when it decides how to run terminal commands.

## Native CLI verification

Build tokenjuice, then run `node scripts/goose-e2e.mjs /path/to/goose` with
Goose `1.57.0`. CI downloads that pinned Linux release and checks its SHA-256
before running the fixture. The fixture uses a disposable HOME and workspace,
the Developer extension, Auto mode and a loopback OpenAI-compatible model endpoint.

Fresh baseline, installed, filename-excluded and uninstalled sessions check
the actual system prompt and follow-up model requests. The checks cover hint
discovery, an 80-entry listing summary, raw bypass, native-normalized exact
reads and complete failed output with exit 7. The failure command uses the
explicit `--keep-failures` option. Existing custom hints survive install and
uninstall.

The deterministic fixture model chooses wrapping only when the native system
prompt contains the installed guidance. This verifies discovery and tool
transport; it does not establish adherence by other models. Desktop sessions,
remote providers, other versions and permission modes remain unqualified.
