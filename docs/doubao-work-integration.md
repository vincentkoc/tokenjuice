# Doubao Work integration

Use the portable [tokenjuice skill](../packaging/skills/doubao-work/tokenjuice/SKILL.md)
with Doubao Work's personal skill importer. This is guidance support. No
filesystem discovery directory or tool-output replacement hook is assumed.

Open **插件·技能·伙伴 → 技能 → + 添加 → 上传技能** and select the local
`tokenjuice` folder or its `SKILL.md`. The personal documentation supports local
skill files or folders. Use the uppercase `SKILL.md` filename required by the
linked Agent Skills format. After importing, start a new task and explicitly
ask to use the tokenjuice skill.

The developer platform's ZIP format places `SKILL.md` at the archive root,
which differs from WorkBuddy's developer package layout. If preparing that
format, run from a checkout:

```bash
cd packaging/skills/doubao-work/tokenjuice
zip tokenjuice-doubao-work.zip SKILL.md
```

A developer ZIP is a distribution format, not proof of acceptance by every
personal desktop importer. Local import and live execution remain unqualified.
Marketplace certification/publication is separate and unnecessary for this
personal workflow.

Have Doubao Work check `tokenjuice --version` in the environment actually running
commands; in Bash also check `command -v tokenjuice`. If missing, install it
there before wrapping. Run a noisy command, an exact read with
`tokenjuice wrap --raw -- <command>` and a failing command. Confirm compacted
output reaches the next model request and exact bytes/status remain intact.
Manage or delete the imported skill through **我安装的**.

Contracts: [personal skills](https://www.doubao.com/work/docs/zh-cn/articles/081010973544-skills),
[developer skill specification](https://open.doubao.com/document/doubao-developer-guide/skill-development-specification).
