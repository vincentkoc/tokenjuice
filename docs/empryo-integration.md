# Empryo / SoulForge integration

Empryo's current runtime and package are named SoulForge (`@proxysoul/soulforge`).
Install a project-local native `PreToolUse` hook:

```bash
tokenjuice install empryo
tokenjuice doctor empryo
```

`soulforge` is an alias for the same installer, doctor and removal commands.
The installer writes `.soulforge/config.json` in the current directory and keeps
unrelated settings and hooks. Run it from the directory where SoulForge starts.
It does not modify the old `.empryo` directory or inherited Claude settings.

The hook rewrites `Bash` input using `tokenjuice wrap --keep-failures -- sh -c`.
SoulForge maps its internal `shell` tool to `Bash`. The adapter preserves other
input fields, including `cwd` and `timeout`, and does not return a permission
decision. Explicit `tokenjuice wrap`, including `--raw`, is left unchanged.
Native Windows uses a different shell; automatic wrapping is limited to POSIX
hosts and WSL.

## Activation and removal

Start a fresh `soulforge` or `sf` session and inspect `/hooks` after installing.
SoulForge merges hooks from user/project Claude files and user/project
`.soulforge/config.json`. Any loaded `disableAllHooks: true` disables all hooks.
The doctor checks that switch and the configured launcher; it does not establish
session activation or model-visible savings.

```bash
tokenjuice uninstall empryo
```

Removal deletes only this adapter's entries. Settings symlinks and permissions
are preserved. Existing configurations receive a backup before mutation.

## Native acceptance and limits

The implementation follows upstream source at
[`c27dac1`](https://github.com/proxysoul/Empryo/tree/c27dac116d2ee1637abfc6634bebf08b5c379454),
whose package reports version `2.20.25`:

- [Hook protocol](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/mintlify-docs/tools/hooks.mdx)
- [Loader and merged config paths](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/src/core/hooks/loader.ts)
- [Input rewrite consumer](https://github.com/proxysoul/Empryo/blob/c27dac116d2ee1637abfc6634bebf08b5c379454/src/core/tools/index.ts)

The [native CLI fixture](../scripts/empryo-e2e.mjs) runs SoulForge `2.20.25`
with Bun `1.3.13` on Linux. It uses an isolated home and project, a loopback
OpenAI-compatible provider, no account credentials, and the default permission
mode. [CI acceptance](https://github.com/vincentkoc/tokenjuice/actions/runs/43573962086/job/132384377504)
checks baseline, installed and uninstalled sessions:

- Native hook receipts confirm config loading, `sh -c` rewriting, retained
  `cwd` and `timeout`, and preservation of custom hooks after removal.
- Follow-up model requests contain an 80-entry listing summary, unchanged
  exact file bytes including CRLF and trailing blank lines, and unchanged raw
  output. Uninstall restores baseline behavior.
- A destructive command remains denied in default mode; its target survives.
- Native post-tool receipts retain all 80 failure stdout lines, stderr and
  the failure flag. A separate exit-7 case retains its status. The model
  receives the same failure stdout as the baseline session.

SoulForge's model serializer chooses stdout before the separate error field.
When failed stdout is present, the model does not receive stderr or exit status.
Its own output compressor also runs on failed commands and can collapse lines
that differ only in numbers. `--keep-failures` preserves failures at the
tokenjuice boundary; it does not remove either host limitation.

Wrapping `cat` and `find` removes SoulForge's success footer recommending its
native `read` or `glob` tool. The footer is host advice; exact file bytes and
explicit raw listing bytes stay intact. Other versions, interactive approval flows,
remote providers and native Windows remain unqualified.

Unit tests also cover symlinks, custom-content preservation, disable switches,
native payloads, raw bypass and the shared shell wrapper. To rerun acceptance
after building tokenjuice and installing the pinned host and Bun:

```bash
node scripts/empryo-e2e.mjs /path/to/soulforge/scripts/launcher.mjs /path/to/bun
```
