# Droid integration

`tokenjuice install droid` installs a `PreToolUse` hook for Factory's `Execute`
tool. It rewrites the command to run through `tokenjuice wrap`, so the tool
returns compacted terminal output. Other tool input fields and Droid's permission
decisions are preserved. Linux, macOS and WSL use a POSIX shell; native Windows
wrapping is not supported.

```bash
tokenjuice install droid
tokenjuice doctor droid
tokenjuice uninstall droid
```

Reinstall to migrate an older tokenjuice `PostToolUse` hook. Migration removes
only tokenjuice entries, including entries inside shared matcher groups.
The old runtime entrypoint remains available for existing installations.
Factory's `additionalContext` adds context beside the original tool result;
`suppressOutput` hides hook output in the UI. Neither replaces terminal output.

The wrapper uses `TOKENJUICE_DROID_SHELL`, then `SHELL`, then `bash` or `sh`.
Commands already using `tokenjuice wrap` are left alone, including the explicit
escape hatch `tokenjuice wrap --raw -- <command>`.

The installer currently writes the legacy `~/.factory/settings.json` hook key.
Factory only reads it when `~/.factory/hooks.json` is absent. Check the effective
configuration in Droid's `/hooks` panel before use if you have that file.

Contract: [Factory hooks](https://docs.factory.com/harness/hooks).
