# Paimon integration

```sh
tokenjuice install paimon
tokenjuice doctor paimon
tokenjuice uninstall paimon
```

This installs a guidance skill at `~/.config/paimon/skills/tokenjuice/SKILL.md`,
or `$PAIMON_CONFIG_HOME/skills/tokenjuice/SKILL.md` when configured. The library
accepts an explicit `configDir`. Installation is idempotent and refuses foreign
skills; uninstall removes only the owned file and preserves supporting files.

[Paimon discovers skills](https://github.com/aisk/paimon#skills) in its native
configuration root, shared user skills and project `.agents/skills` directories.
Project and explicit skills can shadow the user skill. In a fresh session,
invoke `/skill:tokenjuice` to select it; `--no-skills` disables default discovery.

The skill checks tokenjuice availability inside the actual execution environment
and recommends `tokenjuice wrap --keep-failures -- <command>` for noisy output.
Use `tokenjuice wrap --raw -- <command>` for exact bytes. Paimon owns command
execution and permissions; this is not an automatic tool-result hook.

Run `pnpm exec vitest run test/hosts/paimon.test.ts test/hosts/shared/managed-skill.test.ts`,
`pnpm verify` and `pnpm verify:package` to validate the adapter. Native Paimon
skill loading and model-visible output remain unqualified. Confirm a noisy
success, exact read, raw bypass and long failing command in an isolated session;
file doctor alone is not runtime proof.

Sources: [skill discovery](https://github.com/aisk/paimon/blob/master/paimon/skills.py),
[configuration root](https://github.com/aisk/paimon/blob/master/paimon/config.py).
