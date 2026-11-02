"""Check built Python distributions and import an offline-installed wheel."""
from email.parser import BytesParser
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import venv
import zipfile

artifacts = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text())["version"]
wheels = list(artifacts.glob("*.whl"))
sdists = list(artifacts.glob("*.tar.gz"))
assert len(wheels) == len(sdists) == 1, "expect one wheel and one source distribution"

with zipfile.ZipFile(wheels[0]) as archive:
    names = archive.namelist()
    metadata_path = next(name for name in names if name.endswith(".dist-info/METADATA"))
    metadata = BytesParser().parsebytes(archive.read(metadata_path))
    assert metadata["Name"] == "tokenjuice-integrations"
    assert metadata["Version"] == version
    assert metadata["Requires-Python"] == ">=3.11"
    assert metadata["License-Expression"] == "MIT"
    assert set(metadata.get_all("Provides-Extra")) == {"langchain", "fastmcp"}
    assert all("extra ==" in dep for dep in metadata.get_all("Requires-Dist"))
    assert "npm install --global tokenjuice" in metadata.get_payload()
    assert "tokenjuice_integrations/plugin.yaml" in names
    assert any(name.endswith("/licenses/LICENSE") for name in names)
    assert not any(name.endswith(".pyc") for name in names)

with tarfile.open(sdists[0]) as archive:
    names = archive.getnames()
    for suffix in ("/README.md", "/LICENSE", "/pyproject.toml",
                   "/tokenjuice_integrations/bridge.py"):
        assert any(name.endswith(suffix) for name in names), suffix

with tempfile.TemporaryDirectory(prefix="tokenjuice-wheel-") as temp:
    env = Path(temp) / "venv"
    venv.EnvBuilder(with_pip=True).create(env)
    python = env / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    subprocess.run([str(python), "-m", "pip", "install", "--no-index", "--no-deps",
                    str(wheels[0])], check=True)
    subprocess.run([str(python), "-I", "-c", """
import sys
from importlib.metadata import version
from tokenjuice_integrations import register
from tokenjuice_integrations.bridge import compact_result
assert version("tokenjuice-integrations") == sys.argv[1]
assert "langchain" not in sys.modules and "fastmcp" not in sys.modules
class Context:
    def register_hook(self, name, handler):
        assert name == "transform_terminal_output" and callable(handler)
register(Context())
""", version], check=True)

print("Python wheel metadata, sdist contents, and offline install/import passed")
