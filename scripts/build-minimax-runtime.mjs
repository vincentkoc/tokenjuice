import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const bundle = join("dist", "hosts", "minimax-code", "bundle");
await mkdir(join(bundle, ".minimax-plugin"), { recursive: true });
await mkdir(join(bundle, "hooks"), { recursive: true });
await writeFile(join(bundle, ".minimax-plugin", "plugin.json"), `${JSON.stringify({
  schemaVersion: 1,
  name: "tokenjuice",
  version,
  displayName: "tokenjuice",
  description: "Compact successful foreground Bash output through tokenjuice.",
  author: "Vincent Koc",
  icon: "icon.jpg",
  category: "Code",
  exampleQueries: [],
  apps: [],
  mcpServers: [],
  skills: [],
  hooks: ["hooks/hooks.json"],
}, null, 2)}\n`);
await writeFile(join(bundle, "hooks", "hooks.json"), `${JSON.stringify({
  hooks: {
    PreToolUse: [{
      matcher: "bash",
      hooks: [{
        type: "command",
        command: "tokenjuice minimax-code-pre-tool-use",
        timeout: 5,
      }],
    }],
  },
}, null, 2)}\n`);
await copyFile("docs/tokenjuice.jpg", join(bundle, "icon.jpg"));
