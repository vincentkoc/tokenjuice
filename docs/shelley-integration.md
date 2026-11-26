# Shelley integration

```sh
tokenjuice install shelley
tokenjuice doctor shelley
tokenjuice uninstall shelley
```

This installs a guidance skill at `~/.config/shelley/tokenjuice/SKILL.md`.
[Shelley's native loader](https://github.com/boldsoftware/shelley/blob/main/skills/skills.go)
uses the home-relative `.config/shelley` directory directly, without an extra
`skills` component or an `XDG_CONFIG_HOME` override. The library accepts an
explicit `homeDir`; Shelley must run with that same home to discover the skill.
It also discovers project `.skills` and shared agent skill directories.

Installation refuses foreign content and is idempotent. Uninstall removes
only the owned file and preserves its directory and supporting files. Start a
fresh session and ask Shelley to use the `tokenjuice` skill. Doctor checks the
managed file, not native discovery or model-request acceptance.

The skill checks tokenjuice availability inside the actual tool environment.
For noisy output it recommends `tokenjuice wrap --keep-failures -- <command>`;
for exact bytes use `tokenjuice wrap --raw -- <command>`. Shelley retains
execution and permissions. Its [documented hook events](https://github.com/boldsoftware/shelley/blob/main/HOOKS.md)
do not include tool-result replacement, so this integration is guidance only.

Run `pnpm exec vitest run test/hosts/shelley.test.ts test/hosts/shared/managed-skill.test.ts`,
`pnpm verify` and `pnpm verify:package` for adapter validation. Native skill
loading and model-visible output remain unqualified. In an isolated native
session, verify a noisy success, exact read, raw bypass and long failure.
