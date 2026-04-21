# host integration playbook

this document is the implementation checklist for adding a new host integration (like codex, claude-code, cursor, pi).

## when to use this

use this before opening a PR that adds `tokenjuice install <host>` or any new hook/adapter path.

## design decisions first

define the host hook model before writing code:

- can the host rewrite shell input before execution?
- can the host replace shell output after execution?
- are hooks file-based, extension-based, or api-based?
- does the host return plain text, structured json, or both?

pick one integration mode:

- post-tool compaction (preferred when shell output can be replaced safely)
- pre-tool command wrapping (use `tokenjuice wrap` when post replacement is unavailable)

for pre-tool wrapping, preserve shell semantics (for example `bash -lc '<cmd>'`) and ensure classification normalization can recover the nested command.

## implementation checklist

for a new host adapter in `src/hosts/<host>/index.ts`:

- install flow
  - write/update host config atomically
  - preserve unrelated keys
  - keep installation idempotent (replace prior tokenjuice entry, keep non-tokenjuice entries)
- doctor flow
  - detect disabled / warn / broken / ok states
  - validate expected command against installed command
  - report missing executable paths
  - return a single repair command
- runtime hook flow
  - parse hook payload defensively
  - skip non-target tools/events early
  - preserve explicit raw bypass behavior
  - never throw hard on hook input parse failures

then wire CLI + exports:

- `src/cli/main.ts`
  - `install <host>`
  - `doctor <host>`
  - usage text
  - runtime hook entry command if needed
- `src/index.ts`
  - runtime/install/doctor exports
  - result/report type exports
- `src/hosts/shared/hook-doctor.ts`
  - add the host to aggregate doctor report

## test strategy (required)

add host-specific tests and aggregate tests:

- `test/hosts/<host>.test.ts`
  - install idempotency
  - preserve unrelated config fields
  - doctor status matrix (`disabled`, `warn`, `broken`, `ok`)
  - runtime behavior (rewrite/skip/bypass paths)
- aggregate coverage
  - update tests for `doctorInstalledHooks` if the new host is included there

## critical test isolation rules

new adapters often fail CI/local due to leaked machine config. isolate host homes explicitly:

- set and reset host env vars in each suite (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `CLAUDE_HOME`, `CURSOR_HOME`, `PI_CODING_AGENT_DIR`, etc.)
- avoid reading real `~/.<host>` in tests
- use temp dirs for all config paths
- restore `PATH` after each test

if you add a new host to aggregate doctor logic, existing aggregate tests may start failing unless they set that host's env home to temp storage.

## regression gates before merge

minimum gate for a new host adapter:

```bash
pnpm typecheck
pnpm vitest run test/hosts/<host>.test.ts
pnpm vitest run test/hosts/codex.test.ts test/hosts/claude-code.test.ts test/hosts/pi.test.ts
```

if you changed normalization/classification paths, also run:

```bash
pnpm vitest run test/core/command.test.ts test/core/classify.test.ts test/core/trace.test.ts
```

## manual verification flow

run from repo root:

```bash
pnpm build
node dist/cli/main.js install <host>
node dist/cli/main.js doctor <host>
```

for command-path diagnostics, use trace:

```bash
node dist/cli/main.js wrap --format json --trace -- bash -lc "git status --short"
```

verify:

- normalized command/argv match expected command intent
- matched reducer is specific (not generic fallback for common commands)
- raw mode preserves full output:

```bash
node dist/cli/main.js wrap --format json --trace --raw -- <command>
```

## docs updates required in same PR

when adding a host integration, update:

- `README.md` command examples and support table
- `docs/spec.md` supported host hooks table
- dedicated design doc if host behavior differs materially (like cursor pre-tool wrapping)
