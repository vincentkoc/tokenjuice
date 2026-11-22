# Mux / Xum integration

Automatic hook compaction is retired. Use explicit wrapping:

```bash
tokenjuice wrap -- find src -type f
tokenjuice wrap --raw -- cat important.txt
```

Mux is now Xum. The published `@coder/xum@0.32.1` package retains the `mux`
binary alias, `.mux` project metadata and `MUX_*` hook environment aliases.
The rename alone does not break the old adapter.

The [native post-tool contract](https://github.com/coder/xum/blob/main/docs/hooks/tools.mdx)
adds stdout as `hook_output` alongside the original result. A compacted copy
therefore increases model context. It does not replace or suppress the tool
result. Tokenjuice no longer creates that hook; `install mux` fails before
writing any file. Existing `mux-post-tool-use` commands return silently.

Remove a legacy installation with:

```bash
tokenjuice doctor mux
tokenjuice uninstall mux
```

Cleanup targets the nearest Git root's `.mux/tool_post`. Set `MUX_PROJECT_DIR`
or pass the library's `projectDir` option to target another project. Only the
recognized generated tokenjuice block is removed. Unrelated hook text,
permissions and existing backups are preserved. Symlinked hooks or hook
directories require manual inspection before cleanup.

## Native acceptance

After building, run:

```bash
node scripts/mux-e2e.mjs /path/to/@coder/xum/dist/cli/index.js
```

The fixture uses a private home and trusted disposable project with a loopback
provider. It checks baseline and post-hook model requests, exact reads, explicit
wrapping, raw bypass and a failing command with stderr and exit status. Xum
normalizes CRLF and trailing blank lines before delivery; the fixture checks
that native baseline rather than claiming byte-exact reads. This
qualifies the pinned CLI only; desktop sessions, remote providers and other
versions need separate acceptance.
