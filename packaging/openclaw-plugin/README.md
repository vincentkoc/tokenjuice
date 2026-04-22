# tokenjuice for OpenClaw

native OpenClaw plugin package for tokenjuice.

build it from the tokenjuice repo root:

```bash
pnpm build
```

then install the generated package:

```bash
openclaw plugins install /path/to/tokenjuice/dist/openclaw-plugin
```

restart the OpenClaw gateway after install so the embedded extension reloads.
