# shell-wrapper-aware matching plan

## goal

Improve reducer matching so wrapped shell commands match the reducer for the **effective inner command**, not just the outer wrapper.

Examples:

- `cd apps/macos && swift test --filter Foo` → `tests/swift-test`
- `set -euo pipefail && pnpm test` → `tests/pnpm-test`
- `bash -lc 'cd apps/ios && xcodebuild ... build'` → `build/xcodebuild`
- `FOO=1 BAR=2 swift build` → `build/swift-build`
- `pwd && rg -n foo src` → `search/rg`

---

## why this matters

Older pi session analysis showed the biggest remaining miss is shell-wrapped commands landing in `generic/fallback` even when a good reducer already exists.

High-volume wrapper signatures from older sessions:

- `cd`: 943 runs, ~4.87M raw chars
- `set`: 635 runs, ~3.27M raw chars
- `pwd`: 92 runs, ~1.11M raw chars
- `bash`: 214 runs, ~819k raw chars
- `source`: 211 runs, ~688k raw chars

The reducer gap is often not “missing reducer”; it is “wrong command identified”.

---

## non-goals for v1

- no full POSIX shell parser
- no shell execution or env expansion
- no subshell parsing
- no pipeline-aware structural matching
- no rule schema changes required
- no reducer behavior changes beyond better classification/matching

---

## intended behavior

### supported wrapper patterns in v1

#### shell runners

- `bash -c '...'`
- `bash -lc '...'`
- `sh -c '...'`
- `zsh -c '...'`
- `/bin/bash -lc '...'`
- `/bin/sh -c '...'`

#### shell-state/setup segments to skip before matching

Top-level command chain segments that should usually not define reducer matching:

- `cd ...`
- `pwd`
- `set ...`
- `source ...`
- `. file`
- `export ...`
- `unset ...`
- `trap ...`
- env assignment prefixes like `FOO=1 BAR=2 ...`

### intentionally not treated as setup wrappers in v1

These remain normal commands and should not be skipped automatically:

- `echo ...`
- `printf ...`

This keeps v1 conservative and avoids false positives like matching `echo 'swift test'` as a Swift test command.

#### top-level separators to support

- `&&`
- `;`
- newline

### out of scope for v1

- structural parsing of pipelines, e.g. `git diff | rg foo`
- subshells like `(cd apps && swift test)`
- command substitutions like `cmd "$(other)"`
- shell functions / aliases / eval
- wrapper commands like `time ...`, `command ...`, or `env FOO=1 ...` unless added explicitly later

---

## design

### prefer an ordered effective-command pipeline over a broad candidate lattice

The v1 design should stay small and explainable.

Instead of deriving many candidates and letting them all compete globally, derive a tiny ordered set centered on the **effective command**.

### effective-command derivation pipeline

Given `ToolExecutionInput`:

1. start from the original input
2. if the command is a supported shell runner like `bash -lc`, unwrap its shell body once
3. split the shell body or original command into top-level segments on `&&`, `;`, and newline
4. for each segment, strip leading env assignments
5. skip leading setup-only segments like `cd`, `set`, `source`, `export`, `unset`, `trap`, `pwd`
6. choose the **first non-setup top-level segment** as the effective command

This produces a small ordered set of match inputs:

1. `original`
2. `shell-body` if unwrap succeeds
3. `effective` if derivation succeeds

### explicit policy for multiple substantive commands

If a chain contains multiple real commands after leading setup segments, v1 uses the **first substantive command** only.

Examples:

- `cd repo && swift test && rg failure src` → classify as `swift test`
- `pwd && rg foo src && cat README.md` → classify as `rg`

If every top-level segment is setup-only, produce **no effective candidate** and keep raw/original behavior.

Examples:

- `cd apps` → no effective candidate
- `set -euo pipefail` → no effective candidate
- `export FOO=1 && export BAR=2` → no effective candidate

This is more deterministic than letting every segment compete by score and is safer for regression control.

### why this shape is preferred

This approach:

- matches the user’s intuitive “effective inner command” mental model
- is easier to debug than a large candidate graph
- reduces false positives from later chain segments
- avoids magic tuning for many candidate types

---

## selection rules

1. always evaluate the original input
2. evaluate the unwrapped shell body if present
3. evaluate the effective command if present
4. collect matches from those inputs, but ignore `generic/fallback` until specific rule search is exhausted
5. preserve existing rule scoring as the primary ordering to minimize regressions
6. use candidate priority only as a tie-breaker between otherwise comparable matches
7. keep deterministic stable ordering

### tie-breaking

Keep existing rule scoring, but do not rely on arbitrary per-candidate bonus values.

When multiple specific matches exist, prefer by:

1. existing rule score
2. candidate priority: `effective` > `shell-body` > `original`
3. deterministic stable order such as rule id

This is intentionally conservative: existing rule specificity still dominates, while effective-command matching wins when scores are otherwise equal or when the original input only matched fallback.

`generic/fallback` should be treated specially and only considered after all specific matches fail.

---

## safety guardrails

- unwrap depth limit: `1`
- parsing depth limit: `3`
- never throw on parse failure
- if parsing is ambiguous, do less, not more
- preserve old behavior if derivation fails

Because v1 only supports a narrow subset of shell structure, malformed quoting or unsupported syntax should degrade safely to raw/original matching.

---

## proposed internal api changes

### `src/core/command.ts`

Add a new internal type:

```ts
type CommandMatchCandidate = {
  command: string;
  argv: string[];
  source: "original" | "shell-body" | "effective";
};
```

Add helpers:

```ts
export function deriveCommandMatchCandidates(
  input: Pick<ToolExecutionInput, "argv" | "command">,
): CommandMatchCandidate[]

export function resolveEffectiveCommand(
  input: Pick<ToolExecutionInput, "argv" | "command">,
): CommandMatchCandidate | null

function splitTopLevelCommandChain(command: string): string[]
function unwrapShellRunner(input: Pick<ToolExecutionInput, "argv" | "command">): string | null
function stripLeadingEnvAssignments(argv: string[]): string[]
function isSetupWrapperSegment(argv: string[]): boolean
```

Implementation notes:

- use `argv` when available for outer command identity
- use `command` when available for chain splitting and shell-body parsing
- when only one exists, degrade gracefully
- do not assume tokenized `command` is a real shell parser
- dedupe equivalent candidates by normalized `command + argv`
- when two equivalent candidates collapse, keep the most-derived source for stable diagnostics: `effective` > `shell-body` > `original`

### `src/core/classify.ts`

Update classification to:

- derive the small ordered candidate list from input
- evaluate `matchesRule()` against each candidate
- search all **specific** rules first
- order specific matches by existing rule score first, then candidate priority, then stable rule id
- only consider `generic/fallback` after specific rule search is exhausted
- preserve stable deterministic order on ties

Make diagnostics part of v1 rather than deferring them:

```ts
matchedVia?: CommandMatchCandidate["source"]
matchedCommand?: string
```

in `ClassificationResult`.

This will make it much easier to debug false positives and understand why a wrapped command matched.

### `src/core/command.ts` callers

Update these to use the effective command where that behavior is desired:

- `isFileContentInspectionCommand()`
- `isRepositoryInspectionCommand()`
- any helper that finds a matching rule

This is important because wrapped file/search commands are currently misbucketed.

### signatures / analytics

Do **not** silently repurpose raw command normalization.

Today `normalizeCommandSignature()` is useful for understanding outer wrapper prevalence like `cd`, `set`, `bash`, and `source`.

For v1, prefer either:

- keeping `normalizeCommandSignature()` raw and adding `normalizeEffectiveCommandSignature()`
- or explicitly renaming semantics if callers should switch to effective-command analytics

Do not change analytics semantics accidentally.

### `src/core/reduce.ts`

Update any helper path that currently uses raw rule matching to share the same wrapper-aware logic.

In particular, `findMatchingRule()` should reuse the same candidate-aware match selection as classification so behavior does not diverge.

### reference pseudocode

Candidate derivation should stay tiny and linear:

```ts
function deriveCommandMatchCandidates(input): CommandMatchCandidate[] {
  const candidates = [originalCandidate(input)];

  const shellBody = unwrapShellRunner(input);
  if (shellBody) {
    candidates.push(candidateFromCommand(shellBody, "shell-body"));
  }

  const effective = resolveEffectiveCommand(shellBody ? { command: shellBody } : input);
  if (effective) {
    candidates.push(effective);
  }

  return dedupeCandidates(candidates);
}
```

Classification should stay conservative:

```ts
function classifyExecution(input, rules, forcedRuleId) {
  if (forcedRuleId) return forcedClassification(...);

  const candidates = deriveCommandMatchCandidates(input);
  const specificMatches = [];

  for (const candidate of candidates) {
    for (const rule of rules) {
      if (rule.id === "generic/fallback") continue;
      if (matchesRule(rule, candidate)) {
        specificMatches.push({ rule, candidate });
      }
    }
  }

  if (specificMatches.length > 0) {
    const best = sortByRuleScoreThenCandidatePriorityThenRuleId(specificMatches)[0];
    return classificationFrom(best.rule, best.candidate);
  }

  const fallback = rules.find((rule) => rule.id === "generic/fallback");
  return fallback
    ? classificationFrom(fallback, candidates[0] ?? originalCandidate(input))
    : { family: "generic", confidence: 0.2 };
}
```

This shape keeps fallback handling explicit and makes it harder for wrapper logic to create surprising reclassification.

---

## interaction with existing rules

Some rules already encode limited wrapper awareness in `commandIncludes*`, for example by matching strings like:

- `&& xcodebuild `
- `; xcodebuild `
- `\nxcodebuild `

That is acceptable for v1.

Wrapper-aware matching should improve classification without requiring immediate rule cleanup. Later, if the new behavior is stable, some rule-local wrapper hacks can be simplified.

---

## implementation checklist by file

### 1) `src/core/command.ts`

#### add effective-command derivation
- [ ] add `CommandMatchCandidate` internal type
- [ ] add `splitTopLevelCommandChain(command)`
- [ ] make splitting quote-aware and escape-aware
- [ ] split only on top-level `&&`, `;`, newline
- [ ] add `unwrapShellRunner(input)` for `bash/sh/zsh -c/-lc`
- [ ] add `stripLeadingEnvAssignments(argv)`
- [ ] add `isSetupWrapperSegment(argv)` for `cd`, `set`, `pwd`, `source`, `.`, `export`, `unset`, `trap`
- [ ] add `resolveEffectiveCommand(input)`
- [ ] if all segments are setup-only, return `null` effective command
- [ ] add `deriveCommandMatchCandidates(input)` returning only `original`, optional `shell-body`, optional `effective`
- [ ] dedupe candidates by normalized `command + argv`
- [ ] when deduping equivalent candidates, preserve source priority `effective` > `shell-body` > `original`
- [ ] preserve safe fallback behavior on parse failure

#### update normalization helpers
- [ ] decide whether analytics should keep raw signatures or add a second effective-signature helper
- [ ] update `isFileContentInspectionCommand()` to inspect effective command first
- [ ] update `isRepositoryInspectionCommand()` to inspect effective command first

### 2) `src/core/classify.ts`

#### candidate-aware matching
- [ ] add a way to evaluate a rule against a `CommandMatchCandidate`
- [ ] derive ordered candidates inside `classifyExecution()`
- [ ] search for specific rule matches across candidates
- [ ] only consider `generic/fallback` after no specific rule matches
- [ ] keep existing rule score as the primary ordering
- [ ] use candidate priority `effective` > `shell-body` > `original` only as a tie-breaker
- [ ] preserve stable deterministic order on ties
- [ ] include `matchedVia` and `matchedCommand` in `ClassificationResult`

### 3) `src/core/reduce.ts`

No reducer logic change should be required in v1, but verify behavior stays consistent:

- [ ] confirm existing fallback behavior still works when no derived candidate helps
- [ ] confirm wrapped file-content commands still bypass compaction when intended
- [ ] update `findMatchingRule()` to use the same candidate-aware selection logic

### 4) docs

- [ ] add a short note to `docs/rules.md` later if wrapper-aware matching becomes part of public matching semantics

---

## testing plan

The main risk is breaking current matching or creating false positives. Tests must cover both **new wins** and **no regressions**.

### A. unit tests for effective-command derivation

Add tests near command utilities.

#### shell unwrap
- [ ] `bash -lc 'swift test'` → extracts `swift test`
- [ ] `/bin/bash -lc 'xcodebuild -scheme App build'` → extracts inner command
- [ ] `sh -c 'pnpm test'` → extracts `pnpm test`

#### chain splitting
- [ ] `cd apps && swift test` → segments: `cd apps`, `swift test`
- [ ] `set -euo pipefail\npnpm test` → segments: `set -euo pipefail`, `pnpm test`
- [ ] quoted separators do not split: `bash -lc 'echo "a && b"; swift test'`
- [ ] escaped separators do not split incorrectly

#### env stripping
- [ ] `FOO=1 BAR=2 swift build` → `swift build`
- [ ] `DEBUG=1 pnpm test -- --runInBand` → `pnpm test -- --runInBand`
- [ ] `FOO='a b' swift build` → `swift build`
- [ ] non-assignment first token should remain unchanged

#### setup segment detection
- [ ] `cd apps/macos` is setup
- [ ] `pwd` is setup
- [ ] `set -euo pipefail` is setup
- [ ] `source .env` is setup
- [ ] `export FOO=1` is setup
- [ ] `trap 'cleanup' EXIT` is setup
- [ ] `swift test` is **not** setup
- [ ] `rg -n foo src` is **not** setup
- [ ] `echo hi` is **not** setup
- [ ] `printf hi` is **not** setup

#### effective-command choice
- [ ] `cd repo && swift test && rg failure src` resolves effective command to `swift test`
- [ ] `pwd && rg foo src && cat README.md` resolves effective command to `rg -n foo src` or equivalent `rg` command segment
- [ ] `export FOO=1 && export BAR=2` resolves to no effective command

### B. classification regression tests

Add tests near classification / reduce integration.

#### new wins
- [ ] `cd apps/macos && swift test --filter Foo` matches `tests/swift-test`
- [ ] `set -euo pipefail && pnpm test` matches `tests/pnpm-test`
- [ ] `bash -lc 'cd apps/ios && xcodebuild -project App.xcodeproj -scheme App build'` matches `build/xcodebuild`
- [ ] `FOO=1 BAR=2 swift build` matches `build/swift-build`
- [ ] `pwd && rg -n foo src` matches `search/rg`
- [ ] `source .env && cargo test` matches `tests/cargo-test`
- [ ] `cd repo && go test ./...` matches `tests/go-test`
- [ ] `cd repo && pytest` matches `tests/pytest`
- [ ] `cd repo && npm test` matches `tests/npm-test`
- [ ] `cd repo && yarn test` matches `tests/yarn-test`

#### wrapped inspection behavior
- [ ] `pwd && cat README.md` still behaves like file inspection, not aggressive compaction
- [ ] `bash -lc 'cd repo && cat README.md'` still behaves like file inspection
- [ ] `bash -lc 'pwd && rg -n foo src'` still behaves like repository inspection / search
- [ ] `cd repo && nl -ba file.ts | sed -n '1,120p'` still behaves as intended after future inspection improvements

#### no regressions on already-good direct matches
- [ ] direct `swift test` still matches `tests/swift-test`
- [ ] direct `swift build` still matches `build/swift-build`
- [ ] direct `xcodebuild ...` still matches `build/xcodebuild`
- [ ] direct `rg -n foo src` still matches `search/rg`
- [ ] direct `gh pr view 123` still matches `cloud/gh`

#### generic should remain generic when appropriate
- [ ] `bash -lc 'echo hi && echo bye'` remains generic
- [ ] `set -euo pipefail` alone remains generic
- [ ] `cd apps` alone remains generic
- [ ] malformed shell quoting does not crash and falls back safely

#### diagnostics
- [ ] classification for `cd apps && swift test` records `matchedVia: "effective"`
- [ ] classification for `bash -lc 'pnpm test'` records a stable `matchedVia` after candidate dedupe
- [ ] classification records a useful `matchedCommand` for wrapped matches

### C. false-positive prevention tests

These cases ensure wrapper-aware matching does not overreach.

- [ ] `git diff | rg foo` should not be structurally reclassified as `search/rg` in v1 unless already matched by existing command-based logic
- [ ] `echo 'swift test'` should not match a Swift reducer
- [ ] `printf 'xcodebuild -scheme App build'` should not match `build/xcodebuild`
- [ ] `node -e "console.log('pnpm test')"` should not match `tests/pnpm-test`
- [ ] `env FOO=1 swift build` remains unsupported/generic in v1 unless support is added intentionally

### D. analytics / normalization tests

- [ ] raw command signature behavior remains explicit and tested
- [ ] if an effective-signature helper is added, `normalizeEffectiveCommandSignature('cd apps && swift test')` returns `swift`
- [ ] if an effective-signature helper is added, `normalizeEffectiveCommandSignature('bash -lc "pnpm test"')` returns `pnpm`
- [ ] `isRepositoryInspectionCommand('pwd && rg -n foo src')` is true
- [ ] `isFileContentInspectionCommand('cd repo && cat README.md')` is true

### E. replay / fixture validation

Use real commands from old session analysis as regression samples.

#### replay set to validate after implementation
- [ ] `cd apps/macos && swift test --filter TailscaleServeGatewayDiscoveryTests`
- [ ] `pnpm ios:build` if wrapped output can now hit `xcodebuild` only when command derivation exposes it; otherwise document why it still needs output-aware matching later
- [ ] `bash -lc '... kubectl ...'` should hit kubectl reducers when actual inner command is `kubectl ...`
- [ ] `pwd && rg -n ...` should hit `search/rg`
- [ ] `source env.sh && cargo clippy -q` should become matchable by future clippy reducer

### F. behavior parity for helper APIs

- [ ] `findMatchingRule()` agrees with `classifyExecution()` for wrapped commands
- [ ] wrapped inspection commands follow the same effective-command resolution in compaction skip paths

---

## test file mapping

Suggested test placement:

- `test/command.test.ts` or a new command utility test file
  - shell unwrap
  - candidate derivation
  - effective-command resolution
  - normalization
  - inspection helper behavior
- `test/reduce.test.ts`
  - end-to-end reducer selection for wrapped commands
  - diagnostics in classification results
- `test/rules.test.ts`
  - no inventory change required unless new fixtures/rules are added

If no command utility test file exists yet, create one instead of overloading `reduce.test.ts` with parser-only cases.

---

## rollout plan

### phase 1: helpers
- implement shell unwrap, chain splitting, env stripping, and effective-command resolution in `src/core/command.ts`
- add unit tests for parsing / extraction

### phase 2: classification
- update `src/core/classify.ts` to match across `original`, optional `shell-body`, and optional `effective`
- add wrapped-command classification tests
- add `matchedVia` and `matchedCommand`

### phase 3: helpers and analytics
- update inspection helpers to use effective commands
- update any matching helper like `findMatchingRule()` to share the same logic
- decide explicitly whether analytics should remain raw, become effective, or expose both
- add tests for analytics-facing behavior

### phase 4: replay validation
- replay representative older-session commands
- confirm reduced generic fallback for wrappers like `cd`, `set`, `pwd`, `bash`, `source`

---

## success criteria

### functional
- wrapped commands match the same reducers as their direct equivalents when semantics are obvious
- no crashes on malformed or complex shell commands
- direct existing matches still behave identically
- multiple-command chains resolve deterministically via the first substantive command

### measurable
From old-session replay, expect a meaningful drop in generic fallback for wrapper signatures:

- `cd`
- `set`
- `pwd`
- `bash`
- `source`

And meaningful reclassification into existing reducers for:

- `swift build`
- `swift test`
- `xcodebuild`
- `rg`
- `pnpm test/build`
- `kubectl get/describe/logs`
- `cargo test`

---

## follow-up opportunities after v1

If wrapper-aware matching lands cleanly, next likely wins are:

- support additional light wrappers like `env`, `time`, or `command` if real data justifies them
- output-aware classification for script aliases like `pnpm ios:build`
- file-inspection passthrough improvements for `nl -ba`, `sed -n`, `tail -n`
- dedicated reducers for `npm pack` / `pnpm pack`
- dedicated reducer for `cargo clippy`
- optional pipeline-aware parsing in a later phase
