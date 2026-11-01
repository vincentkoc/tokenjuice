<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

tokenjuice runs noisy commands and returns smaller, deterministic output to your agent.
JSON rules summarize listings, test output, build logs, and other terminal output.
The same core powers the CLI and host integrations.

## install

Requires **Node.js 22 or newer**.

```bash
npm install -g tokenjuice
tokenjuice --version
tokenjuice wrap -- git status
```

Other package managers:

```bash
pnpm add -g tokenjuice
yarn global add tokenjuice
```

For Homebrew:

```bash
brew tap vincentkoc/tap
brew install tokenjuice
```

See [distribution](docs/distribution.md) for release artifacts and Linux packages.

## host integrations

Choose an integration from the [client catalog](docs/integrations.md).
Check its guide before installing: automatic replacement, command wrapping, and skill guidance have different contracts.
The [support matrix](docs/adapter-support-matrix.md) records native test versions and remaining acceptance work.

For example, Claude Code uses pre-tool command wrapping:

```bash
tokenjuice install claude-code
tokenjuice doctor claude-code
```

Restart the host or start a fresh session as its guide requires.
A successful doctor check confirms managed configuration. It does not prove that the host loaded it or delivered compacted output.
Use `tokenjuice uninstall claude-code` to remove tokenjuice's managed wiring.

OpenClaw uses the external `@openclaw/tokenjuice` plugin:

```bash
openclaw plugins install @openclaw/tokenjuice
openclaw config set plugins.entries.tokenjuice.enabled true
openclaw gateway restart
```

Match the plugin to your OpenClaw version. See the [OpenClaw guide](https://docs.openclaw.ai/tools/tokenjuice) for host compatibility.

## commands

```bash
tokenjuice --help
tokenjuice reduce build.log
tokenjuice reduce-json result.json
tokenjuice wrap -- pnpm test
tokenjuice wrap --keep-failures -- pnpm test
tokenjuice wrap --raw -- git status
tokenjuice wrap --store -- pnpm test
tokenjuice doctor hooks
tokenjuice stats --timezone utc
tokenjuice verify --fixtures
tokenjuice discover
```

`reduce` compacts existing text. `wrap` runs a command and compacts its observed output.
`reduce-json` provides the machine protocol for adapters.
See the [spec](docs/spec.md) for options, JSON envelopes, rules, and storage behavior.

## output and storage

Host integrations preserve exact file reads and apply their documented compaction policy to eligible output.
Use `--keep-failures` to preserve failed commands' stdout, stderr, and exit status within the capture limit.
Automatic pre-tool wrappers enable this option.

`--raw` and its alias `--full` bypass reduction. They still obey the capture limit, which defaults to `4mb`.
Increase `--max-capture-bytes` when you need a larger capture.

Raw artifact storage is opt-in through `--store`.
The Pi extension is the exception: it stores the raw bytes of every rewrite for retrieval with `tokenjuice cat <artifact-id>`.
Set `TOKENJUICE_ARTIFACT_DIR` to choose the artifact directory.

Statistics use bounded metadata segments. `tokenjuice stats --limit 1000` reports partial coverage and a cursor for the next page.
Set `TOKENJUICE_STATS=off` or pass `--no-stats` to disable metadata and hook-debug telemetry writes.

Rules load from built-ins, `~/.config/tokenjuice/rules`, and `.tokenjuice/rules`.
Later layers override earlier rules by ID. See [rule authoring](docs/rules.md).

## docs

- [documentation index](docs/README.md) — all integration guides and reference pages
- [client catalog](docs/integrations.md) — setup routes and configuration locations
- [support and verification](docs/adapter-support-matrix.md) — evidence and acceptance limits
- [spec](docs/spec.md) — CLI, adapter protocol, compaction, and storage
- [contributing](CONTRIBUTING.md) — development and validation
- [security](SECURITY.md) — private vulnerability reporting

💙 built by [Vincent Koc](https://github.com/vincentkoc).
