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
    "argvIncludes": [["status"]]
  },
  "transforms": {
    "stripAnsi": true,
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
- `match`: command/tool matching conditions
- `filters.skipPatterns`: lines to drop
- `filters.keepPatterns`: lines to prefer
- `transforms`: output normalization toggles
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

## rule-writing advice

- prefer specific `match` clauses over giant regexes
- keep counters factual and cheap
- do not invent prose in rules
- preserve failure detail more than success noise
- use project overrides for local weirdness, not built-ins
