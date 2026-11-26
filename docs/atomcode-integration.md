# AtomCode integration

Install a project skill from the project root:

```bash
tokenjuice install atomcode
tokenjuice doctor atomcode
tokenjuice uninstall atomcode
```

Tokenjuice installs `.atomcode/skills/tokenjuice/SKILL.md` in the detected Git
root, or the current directory when there is no Git root. `ATOMCODE_PROJECT_DIR`
selects an explicit project. The library functions also accept `projectDir`.

AtomCode documents project skills in `.atomcode/skills/` and global skills in
`~/.atomcode/skills/`; project skills override globals with the same name. The
installer uses only the project scope. It does not change `.atomcode.md`,
`AGENTS.md`, permissions or marketplace settings.

Invoke `$tokenjuice` or `/skills tokenjuice` in AtomCode, then check that the
skill loaded. Its guidance asks the agent to check tokenjuice inside the actual
execution environment, wrap noisy commands with `--keep-failures`, and use
`--raw` when original bytes are needed. It grants no `allowed-tools` permissions.

This is guidance, not automatic tool interception. File lifecycle tests cover
installation, idempotence, foreign files, symlink refusal and uninstall. Native
discovery, model adherence and command execution remain unqualified. A clean
doctor result verifies the managed file only.

Uninstall removes only the tokenjuice-owned skill file and preserves other
skills and project instructions. A custom unowned file is never overwritten.

References: [AtomCode skills](https://atomcode.atomgit.com/docs/en/skills.html),
[project instructions](https://atomcode.atomgit.com/docs/en/project-instructions.html).
