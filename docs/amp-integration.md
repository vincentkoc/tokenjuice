# Amp integration

Amp support is beta.

`tokenjuice install amp` inserts a marker-delimited instruction block into the
Amp instruction file at the workspace root. It uses `AGENTS.md` by default, but
preserves Amp's fallback behavior by updating an existing `AGENT.md` or
`CLAUDE.md` when no `AGENTS.md` exists in that directory. Amp automatically
includes instruction files from the current working directory, parent
directories, editor workspace roots, and relevant subtrees, so this gives Amp
stable guidance for using tokenjuice when it runs terminal commands.

## Install

```bash
tokenjuice install amp
tokenjuice doctor amp
```

## Behavior

- The instruction block tells Amp to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The instruction block tells Amp to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing instruction-file content is backed up before install and preserved
  around the tokenjuice block.

## Current beta caveat

Amp `AGENTS.md` files are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Amp a stable project
instruction to follow when it decides how to run terminal commands.

tokenjuice intentionally manages only Amp instruction files inside the current
git/project root. Amp can also load parent, user, and system instruction files;
those higher-scope files remain user-managed so `tokenjuice install amp` does
not accidentally rewrite organization or personal guidance outside the active
project.
