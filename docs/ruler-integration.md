# Ruler integration

Ruler support is beta.

`tokenjuice install ruler` writes `.ruler/tokenjuice.md` in the current git
root, or in `RULER_PROJECT_DIR` when set. Ruler treats Markdown files under
`.ruler/` as source rules and propagates them to configured coding agents when
you run `ruler apply`.

## Install

```bash
tokenjuice install ruler
ruler apply
tokenjuice doctor ruler
```

## Behavior

- The source rule tells downstream agents to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The source rule tells downstream agents to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.ruler/tokenjuice.md` content is backed up before install.

## Current beta caveat

Ruler is a propagation layer, not a command runtime. This integration does not
intercept shell output; it gives Ruler one tokenjuice rule source that can be
distributed to the agents already configured in `ruler.toml`.
