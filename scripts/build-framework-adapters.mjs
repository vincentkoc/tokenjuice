import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = process.argv[2] ?? "dist";
const python = `${output}/python`;
await mkdir(python, { recursive: true });
await cp("src/python/tokenjuice_integrations", `${python}/tokenjuice_integrations`, { recursive: true, filter: path => !path.includes("__pycache__") });
await cp("src/python/README.md", `${python}/README.md`);
await cp("LICENSE", `${python}/LICENSE`);
await writeFile(`${python}/pyproject.toml`, `[build-system]
requires = ["setuptools>=77.0.3,<85"]
build-backend = "setuptools.build_meta"

[project]
name = "tokenjuice-integrations"
version = "${version}"
description = "Local tool-result compaction for LangChain and FastMCP"
readme = "README.md"
license = "MIT"
license-files = ["LICENSE"]
authors = [{ name = "Vincent Koc" }]
requires-python = ">=3.11"
dependencies = []

[project.urls]
Homepage = "https://github.com/vincentkoc/tokenjuice"
Documentation = "https://github.com/vincentkoc/tokenjuice/blob/main/docs/framework-integrations.md"
Source = "https://github.com/vincentkoc/tokenjuice"
Issues = "https://github.com/vincentkoc/tokenjuice/issues"

[project.optional-dependencies]
langchain = ["langchain>=1.4,<2"]
fastmcp = ["fastmcp>=4.1,<5"]

[tool.setuptools.packages.find]
include = ["tokenjuice_integrations*"]

[tool.setuptools.package-data]
tokenjuice_integrations = ["plugin.yaml", "README.md"]
`);
const hermes = `${output}/hosts/hermes/bundle`;
await mkdir(hermes, { recursive: true });
await cp("src/python/tokenjuice_integrations", `${hermes}/tokenjuice_integrations`, { recursive: true, filter: path => !path.includes("__pycache__") });
const manifest = await readFile("src/python/tokenjuice_integrations/plugin.yaml", "utf8");
await writeFile(`${hermes}/plugin.yaml`, manifest.replace(/^version: .+$/m, `version: ${version}`));
await writeFile(`${hermes}/__init__.py`, "from .tokenjuice_integrations.hermes import register\n");
