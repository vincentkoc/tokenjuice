# Aider integration

Aider support is beta.

`tokenjuice install aider` writes `CONVENTIONS.tokenjuice.md` in the current
workspace. Load it with:

```bash
aider --read CONVENTIONS.tokenjuice.md
```

or add the file to `.aider.conf.yml` using Aider's `read` configuration.

## Behavior

- The convention tells Aider to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The convention tells Aider to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `CONVENTIONS.tokenjuice.md` content is backed up before install.

## Current beta caveat

Aider convention files are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Aider a stable convention to
follow when it decides to run or suggest terminal commands.
