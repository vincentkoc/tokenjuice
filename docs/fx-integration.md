# fx integration

`tokenjuice install fx` adds a marker-delimited guidance block to the project's
`AGENTS.md`. fx documents project and nested `AGENTS.md` discovery in its
[official README](https://github.com/vercel-labs/fx#readme).

```sh
tokenjuice install fx
tokenjuice doctor fx
tokenjuice uninstall fx
```

The default target is the nearest Git root, or the current directory outside Git.
Set `FX_PROJECT_DIR=/path/to/workspace` for all three commands to select another
workspace. The library also accepts `{ projectDir }` or an explicit instruction
path. This integration only manages project instructions; fx's global
`~/.fx/AGENTS.md` is not changed by the default installer.

Existing instructions and other hosts' tokenjuice blocks survive installation
and removal. Reinstalling is idempotent. Malformed tokenjuice markers stop edits
so the existing content can be repaired first.

The guidance asks fx to use `tokenjuice wrap -- <command>` for noisy commands,
`tokenjuice wrap --keep-failures -- <command>` to preserve failures, and
`tokenjuice wrap --raw -- <command>` for raw output. It does not install hooks,
change permissions, or guarantee that a model follows the guidance. Start a fresh
fx session after installation. Native discovery and model-visible execution
remain unqualified; passing doctor proves only the managed file's condition.
