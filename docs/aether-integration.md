# Aether integration

`tokenjuice install aether` writes `.aether/tokenjuice.md` and adds that prompt
source to every configured agent in `.aether/settings.json`.

```bash
tokenjuice install aether
tokenjuice doctor aether
```

The Aether project must already have `.aether/settings.json`; run `aether` once
first if the project has not been initialized. After install, verify the active
agent prompt:

```bash
aether show-prompt -a <agent>
```

## behavior

- Existing `.aether/tokenjuice.md` and `.aether/settings.json` content is backed
  up before install.
- Each configured agent gets `.aether/tokenjuice.md` appended to its `prompts`
  array when missing.
- `tokenjuice uninstall aether` removes the prompt source reference from
  configured agents and deletes `.aether/tokenjuice.md`.
- `AETHER_PROJECT_DIR` can point tests or managed installs at another project
  root.

## limits

Aether prompt sources are model instructions, not command hooks. This integration
does not intercept shell output; it gives Aether agents stable guidance to use
`tokenjuice wrap -- <command>` for noisy terminal commands and
`tokenjuice wrap --raw -- <command>` when exact bytes are required.
