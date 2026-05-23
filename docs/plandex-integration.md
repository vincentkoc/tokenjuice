# Plandex integration

Plandex support is beta.

`tokenjuice install plandex` writes `PLANDEX.tokenjuice.md` in the current git
root, or in `PLANDEX_PROJECT_DIR` when set. Load it into the current Plandex
plan with the command printed by the installer. From the project root, that is:

```bash
plandex load PLANDEX.tokenjuice.md
```

or from the Plandex REPL:

```text
@PLANDEX.tokenjuice.md
```

## Behavior

- The convention tells Plandex to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The convention tells Plandex to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- When loading noisy command output into Plandex context, compact it first:

```bash
tokenjuice wrap -- pnpm test | plandex load
```

Existing `PLANDEX.tokenjuice.md` content is backed up before install.

## Current beta caveat

Plandex context files are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Plandex a stable convention
to load into a plan when you want tokenjuice behavior.
