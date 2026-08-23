import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools" / "mod.mjs"


class ModCliTests(unittest.TestCase):
    def test_init_build_test_and_pack_gameplay_mod(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            mod = temp / "sample"
            packed = temp / "packed"

            self.run_cli("init", "sample", "--out", str(mod))
            self.run_cli("build", str(mod))
            self.run_cli("test", str(mod))
            self.run_cli("pack", str(mod), "--out", str(packed))

            manifest = json.loads((packed / "mod.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["id"], "local:sample")
            self.assertTrue((packed / "gameplay" / "node" / "index.js").is_file())
            self.assertTrue((packed / "gameplay" / "cocos" / "index.js").is_file())
            self.assertFalse((packed / "gameplay" / "source").exists())

    def run_cli(self, *arguments, cwd=ROOT):
        subprocess.run(
            ["node", str(TOOL), *arguments],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
