# WorkBuddy desktop integration

Use the portable [tokenjuice skill](../packaging/skills/workbuddy/tokenjuice/SKILL.md)
with WorkBuddy desktop. This is guidance support; it does not install a desktop
hook or provide transparent output replacement. WorkBuddy and CodeBuddy CLI
have separate execution/configuration surfaces.

## Package and import

The checked-in package follows the WorkBuddy developer skill structure:
`tokenjuice/SKILL.md`, with the required name, localized display/description,
version and author fields. To create a developer-format ZIP from a checkout:

```bash
cd packaging/skills/workbuddy
zip tokenjuice-workbuddy.zip tokenjuice/SKILL.md
```

In WorkBuddy desktop, open **专家·技能·连接器 → 技能 → 添加技能 → 上传技能**
and follow its local-package upload dialog. Desktop documentation establishes
this import route but does not pin accepted archive extensions or ZIP-root
normalization. The developer ZIP format does not establish acceptance by every
desktop version; local import remains unqualified. No marketplace submission or
publication is required for this personal workflow.

## Verify execution

Start a new conversation and explicitly ask to use the tokenjuice skill.
Have the agent check `command -v tokenjuice` and `tokenjuice --version` inside
its actual Bash tool environment, then wrap a noisy command. Confirm that the
next model request receives compacted output. Check an exact file read with
`tokenjuice wrap --raw -- <command>` and verify a failing command's status.
An installation on the desktop host alone does not establish tool visibility.

Remove the imported skill through WorkBuddy's skill manager. No undocumented
`~/.workbuddy` discovery directory is assumed. Desktop hook support is listed
by WorkBuddy, but its configuration path, payload and output-rewrite contract
remain unqualified; `tokenjuice install codebuddy` targets the separate CLI.

Contracts: [developer skill package](https://open.workbuddy.cn/docs/skill),
[desktop skill manager](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market).
