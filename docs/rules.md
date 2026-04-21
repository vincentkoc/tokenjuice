# rules

## philosophy

rules should stay small, inspectable, and boring.

if a rule needs a novel mini-language to express itself, that usually means the engine needs a new capability instead of the rule file becoming cursed.

## schema

the canonical JSON schema lives at `src/rules/tokenjuice-rule.schema.json`.

tokenjuice also validates rules at runtime and compiles regex at load time, so bad rules fail early.

## precedence

rule layers:

1. built-in rules in `src/rules`
2. user overrides in `~/.config/tokenjuice/rules`
3. project overrides in `.tokenjuice/rules`

override behavior is by `id`.

## shape

example:

```json
{
  "id": "git/status",
  "family": "git-status",
  "match": {
    "argv0": ["git"],
    "gitSubcommands": ["status"]
  },
  "transforms": {
    "stripAnsi": true,
    "prettyPrintJson": true,
    "dedupeAdjacent": true,
    "trimEmptyEdges": true
  },
  "filters": {
    "skipPatterns": [
      "^On branch ",
      "^Your branch is "
    ]
  },
  "summarize": {
    "head": 10,
    "tail": 4
  },
  "failure": {
    "preserveOnFailure": true,
    "head": 12,
    "tail": 12
  },
  "counters": [
    {
      "name": "modified",
      "pattern": "modified:"
    }
  ]
}
```

## fields

- `id`: stable override key
- `family`: high-level classifier family
- `match`: command/tool matching conditions. `gitSubcommands` matches the parsed Git subcommand after global Git options such as `-C` and `--git-dir`.
- `filters.skipPatterns`: lines to drop
- `filters.keepPatterns`: lines to prefer
- `transforms`: output normalization toggles
- `transforms.prettyPrintJson`: reformat parseable object/array JSON before line filters
- `summarize`: head/tail retention on success
- `failure`: more generous retention on failure
- `counters`: named regex counters used in summaries

## verify

run:

```bash
tokenjuice verify
```

that checks:

- JSON parses
- schema shape is valid
- regex patterns compile
- duplicate ids inside the same layer are rejected

`tokenjuice discover` and `tokenjuice doctor` use stored artifact metadata to show:

- commands that keep falling back to `generic/fallback`
- reducers that still save too little on real runs

## fixtures

builtin reducers now have fixture files under `src/rules/fixtures`.

run:

```bash
tokenjuice verify --fixtures
```

that checks:

- rule integrity
- fixture loading
- expected reducer matching
- key text preserved or removed by the reducer

## rule-writing advice

- prefer specific `match` clauses over giant regexes
- keep counters factual and cheap
- do not invent prose in rules
- preserve failure detail more than success noise
- use project overrides for local weirdness, not built-ins

## repository inventory reducers

built-in filesystem inventory reducers cover:

- `filesystem/find`
- `filesystem/ls`
- `filesystem/rg-files`
- `filesystem/git-ls-files`
- `filesystem/fd`

host adapters may gate these reducers with the safe-inventory inspection policy. that policy keeps exact file reads raw, allows standalone inventory output, allows simple path-filtering pipelines, and rejects mixed command sequences or unsafe downstream transforms before reduction.
