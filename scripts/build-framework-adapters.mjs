import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = process.argv[2] ?? "dist";
const python = `${output}/python`;
await mkdir(python, { recursive: true });
await cp("src/python/tokenjuice_integrations", `${python}/tokenjuice_integrations`, { recursive: true, filter: path => !path.includes("__pycache__") });
await writeFile(`${python}/pyproject.toml`, `[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "tokenjuice-integrations"\nversion = "${version}"\nrequires-python = ">=3.11"\ndependencies = []\n\n[project.optional-dependencies]\nlangchain = ["langchain>=1.4,<2"]\nfastmcp = ["fastmcp>=4.1,<5"]\n\n[tool.setuptools.packages.find]\ninclude = ["tokenjuice_integrations*"]\n`);
const hermes = `${output}/hosts/hermes/bundle`;
await mkdir(hermes, { recursive: true });
await cp("src/python/tokenjuice_integrations", `${hermes}/tokenjuice_integrations`, { recursive: true, filter: path => !path.includes("__pycache__") });
await writeFile(`${hermes}/plugin.yaml`, `name: tokenjuice\nversion: ${version}\ndescription: Compact successful terminal output before model consumption\nauthor: tokenjuice\nprovides_hooks:\n  - transform_terminal_output\n`);
await writeFile(`${hermes}/__init__.py`, "from .tokenjuice_integrations.hermes import register\n");
