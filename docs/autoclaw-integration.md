# AutoClaw integration

AutoClaw's public contract supports creating a skill through its UI. Use the
[copyable tokenjuice workflow](../packaging/skills/autoclaw/tokenjuice-instructions.md)
as its instructions. This is a manual guidance route; there is no
`tokenjuice install autoclaw` command or verified filesystem discovery path.

1. Open **Skill & 连接器 → Skill → 我的Skills → 创建**.
2. Name the skill `tokenjuice` and provide the linked workflow instructions.
3. Start a fresh conversation and use `@` to select it, or explicitly ask to
   use the tokenjuice skill.
4. Confirm the selected agent has command execution and can run
   `tokenjuice --version` inside that environment. In Bash, also check
   `command -v tokenjuice`. Report missing capabilities/dependencies before use.
5. Wrap a noisy command, then check an exact read using
   `tokenjuice wrap --raw -- <command>` and a failing command's exit status.
   Confirm compacted output reaches the next model request.

AutoClaw retains tool execution and approval decisions. Desktop, cloud and
other agent environments must be checked independently. Public OpenClaw
branding does not establish that an AutoClaw build loads tokenjuice's OpenClaw
extension ABI. Do not copy that extension into an undocumented directory.

Live skill creation, invocation and shell execution remain unqualified. Edit or
remove the created skill using AutoClaw's own skill manager.

Contract: [AutoClaw skills](https://autoclaw.zhipuai.cn/docs/advanced/skill/).
