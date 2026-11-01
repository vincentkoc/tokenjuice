# tokenjuice spec

## summary

tokenjuice is a TypeScript-first output compaction system for terminal-heavy and agent-heavy workflows.

it has two explicit product surfaces:

- `tokenjuice`: the core library + CLI
- host integrations such as `@openclaw/tokenjuice`: adapters over documented host surfaces

the package reduces observed output after execution, can store raw output as a local artifact when explicitly requested, and keeps prompt-facing text compact and deterministic.

## goals

- cut transcript token waste without changing command semantics
- keep raw output recoverable and inspectable
- prefer deterministic reducers over vague summaries
- keep the core host-agnostic
- make the CLI clean enough for npm first, then brew/apt/dnf packaging

## non-goals

- silent command rewriting by default
- turning v1 into an LLM summarizer
- becoming a shell framework
- trying to solve every tool class in one release

## truncation model

tokenjuice intentionally uses deterministic truncation as a default strategy for prompt-facing output. this is a cost/clarity tradeoff, not an error path.

there are two independent boundaries:

- reducer boundary: rule summaries (especially `generic/fallback`) keep head/tail slices and may omit middle sections.
- capture boundary: `tokenjuice wrap` enforces `--max-capture-bytes` (default `4mb`) to avoid unbounded memory growth while collecting tool output.

important implications:

- `--raw` is the explicit escape hatch for reducer compaction.
- `--raw` does not bypass capture limits; increase `--max-capture-bytes` when full capture is required.
- frequent `generic/fallback` matches on a command family are a reducer-coverage signal, not a reason to make fallback "smarter".

## architecture

### core package

the core package owns:

- classification
- reduction
- artifact storage
- rule loading and validation
- CLI behavior

the public model is deliberately plain-object heavy. no framework assumptions, no giant class graph.

### adapters

host adapters should own:

- hook wiring
- host-specific storage defaults
- message conversion
- retrieval seams when needed
- host-native installation surfaces such as hooks or extension files

if reducer logic starts leaking into an adapter, the boundary is wrong.

For contributor guidance, see the [integration playbook](integration-playbook.md).

host adapters choose an inspection policy before calling the shared compactor. the Codex, Claude Code, and pi adapters use the safe-inventory policy:

- exact file-content reads stay raw (`cat`, `sed`, `head`, `tail`, `nl`, `bat`, `jq`, `yq`)
- size and prose shape do not change this. a file read over 4,000 characters stays raw
- a command whose text contains `package-lock.json` is the exception. it may be replaced by the package-lock summary
- standalone repository inventory commands can compact when they are inventory-only (`find`, `ls`, `rg --files`, `git ls-files`, `fd`)
- inventory pipelines compact only when downstream commands are structural stdin transforms (`sort`, `head`, `tail`, `uniq`)
- source inventory commands that execute other commands, such as `find ... -exec ...` or `fd --exec ...`, stay raw
- mixed command sequences and unsafe inventory pipelines stay raw

## operating modes

T3 Code delegates execution to provider agents. See the
[provider configuration and verification guide](t3-code-integration.md) for its
compatibility boundary; an underlying adapter passing does not qualify T3's
provider propagation.

### reduce

reduce text from stdin or a file:

```bash
tokenjuice reduce
tokenjuice reduce build.log
pnpm test 2>&1 | tokenjuice reduce
```

### reduce-json

reduce a structured tool payload for host adapters:

```bash
cat payload.json | tokenjuice reduce-json
tokenjuice reduce-json payload.json
```

this is the machine-facing protocol surface. it accepts either:

- a direct `ToolExecutionInput` JSON object
- an envelope with `{ input, options }`

### wrap

explicitly run a command through tokenjuice:

```bash
tokenjuice wrap -- git status
tokenjuice wrap --store -- pnpm test
```

this is command wrapping, not command rewriting.

### artifact

inspect stored raw output:

```bash
tokenjuice ls
tokenjuice cat tj_xxxxx
```

### verify

validate the loaded rule set:

```bash
tokenjuice verify
tokenjuice verify --format json
tokenjuice verify --fixtures
```

### discover

inspect stored artifacts and surface likely next reducer work:

```bash
tokenjuice discover
tokenjuice discover build.log --source-command "pnpm tsc --noEmit" --exit-code 2
```

### doctor

summarize reducer health and savings:

```bash
tokenjuice doctor
tokenjuice doctor hooks
tokenjuice doctor pi
tokenjuice doctor pi-go
cat build.log | tokenjuice doctor --source-command "pnpm eslint src" --exit-code 1
```

### stats

Summarize bounded compaction metadata:

```bash
tokenjuice stats
tokenjuice stats --format json
tokenjuice stats --timezone utc
tokenjuice stats --limit 1000
```

daily stats are bucketed in the local timezone by default. pass `--timezone utc` for UTC buckets or an IANA timezone such as `America/New_York` for explicit reporting.
stats read the bounded metadata-segment store only. output identifies legacy sidecars as excluded, reports partial coverage, and returns a cursor when another page is available. set `TOKENJUICE_STATS=off`, or pass `--no-stats` to `reduce` or `wrap`, to suppress metadata and hook-debug telemetry writes.

### install, doctor, and uninstall

Choose a supported route from the [integration catalog](integrations.md) and read its guide.
Some hosts use explicit wrapping or a separate plugin instead of `tokenjuice install`.
For example:

```bash
tokenjuice install claude-code
tokenjuice doctor claude-code
tokenjuice doctor hooks
tokenjuice uninstall claude-code
```

Install and uninstall preserve unrelated configuration within each adapter's documented ownership boundary.
`doctor hooks` checks installed wiring, including stale Homebrew paths. A successful check does not establish native host execution.

For a local build, use the host's documented `--local` route:

```bash
pnpm build
node dist/cli/main.js install claude-code --local
node dist/cli/main.js doctor claude-code --local
```

Use a disposable host home for development checks. See the [integration playbook](integration-playbook.md#manual-verification-flow).
Retired additive hooks do not support new automatic installations. Their guides describe explicit wrapping and scoped legacy cleanup.

## rule model

tokenjuice uses JSON rules because they are easy to parse, easy to validate, and easy to inspect in tooling.

rule behavior is intentionally small:

- `match`
- `filters`
- `transforms`
- `summarize`
- `failure`
- `counters`

more power belongs in the core engine first. a huge DSL too early is how these tools get gross.

## rule precedence

rules load in this order:

1. built-in rules
2. user rules from `~/.config/tokenjuice/rules`
3. project rules from `.tokenjuice/rules`

later layers override earlier ones by rule id.

this gives a sane default without forcing people to fork the package for one weird project.

## artifact model

raw artifacts are file-backed in v1:

- one raw text file
- one metadata JSON sidecar

default storage is `~/.tokenjuice/artifacts`. set `TOKENJUICE_ARTIFACT_DIR`
to override that base directory, or pass `storeDir` through the library/cli
surfaces that already support it.

raw retention is opt-in. statistics use daily, sharded JSONL segments under
`metadata-v1/`, capped by default at 14 days, 8 shards per day, and 1 MiB per
segment. readers are paged and bounded by file count and segment size. metadata
references identify `metadataFormat: "jsonl-segment"` and `metadataRecordId`;
the shared `metadataPath` is a segment container, not a standalone JSON object.

legacy artifact sidecars remain readable through raw-artifact APIs. stats do not
scan, migrate, rewrite, or delete them.

## reliability priorities

- keep raw artifact storage opt-in, with one named exception: the pi extension stores the raw bytes of every rewrite (default `~/.tokenjuice/artifacts`, override with `TOKENJUICE_ARTIFACT_DIR`) so its compaction notice always names a recoverable artifact; a kept output stores nothing
- store raw artifacts with private permissions where the platform supports it
- validate artifact ids before lookup
- bound captured output and direct input sizes so hostile or accidental huge logs do not blow up memory
- validate rule structure before loading
- compile regex once at load time, not every reduction call
- choose the most specific matching rule, not the first one that happens to match
- keep fallback behavior deterministic
- preserve more context on non-zero exits
- make verification cheap and scriptable
- make diagnostics artifact-driven so tuning follows real usage
- make savings measurable per reducer and per command over time
- keep reducer behavior pinned with fixture-backed verification

## distribution

Requires Node.js 22 or newer. The compiled JavaScript package follows one distribution path:

- build TypeScript to runnable JavaScript in `dist/`
- publish the npm package with the `tokenjuice` bin entry
- generate a GitHub release tarball with `dist/` plus a small launcher
- generate a Homebrew formula from that tarball

that keeps npm, `npx`, global installs, and Homebrew aligned around one executable surface instead of juggling a second native-binary path too early.
