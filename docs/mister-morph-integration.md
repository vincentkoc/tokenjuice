# Mister Morph integration

```sh
tokenjuice install mister-morph
tokenjuice doctor mister-morph
tokenjuice uninstall mister-morph
```

The installer writes `~/.morph/skills/tokenjuice/SKILL.md`, or
`$MISTER_MORPH_FILE_STATE_DIR/skills/tokenjuice/SKILL.md` when configured.
The library accepts an explicit `stateDir` for a native `--state-dir` override.
For a legacy configuration with a different state directory or a custom
`skills.dir_name`, select the matching root before installing or import the
skill through the native skill manager. This installer does not parse or edit
Mister Morph's configuration database.

[Native skills](https://github.com/quailyquaily/mistermorph/blob/main/docs/skills.md)
add prompt context; they do not create tools. Enable the native Bash tool
independently, then start a fresh run with `--skill tokenjuice` or an explicit
`$tokenjuice` reference. `skills.load` and `skills.enabled` control automatic
loading. The [state directory contract](https://github.com/quailyquaily/mistermorph/blob/main/docs/configuration.md)
explains native configuration precedence.

The skill first checks tokenjuice inside the actual tool environment. It uses
`tokenjuice wrap --keep-failures -- <command>` for noisy output and
`tokenjuice wrap --raw -- <command>` for exact bytes. Mister Morph retains
execution and approval decisions. Installation refuses foreign skills and
uninstall removes only its owned file, preserving supporting files.

Run `pnpm exec vitest run test/hosts/mister-morph.test.ts test/hosts/shared/managed-skill.test.ts`,
`pnpm verify` and `pnpm verify:package` for the adapter checks. Native skill
loading and follow-up model-request acceptance remain unqualified. Verify a
noisy success, exact read, raw bypass and long failure in an isolated native
session. Doctor checks the managed file only.
