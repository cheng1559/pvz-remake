import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools" / "mod" / "cli.ts"
TSX = ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"


class ModCliTests(unittest.TestCase):
    def test_pack_compiles_server_without_writing_to_source(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            mod = temp / "sample"
            packed = temp / "packed"
            published = temp / "resources" / "base.zip"
            published.parent.mkdir()
            published.write_bytes(b"previous-archive")

            self.run_cli("init", "sample", "--out", str(mod))
            self.assertTrue((mod / "src" / "server" / "index.ts").is_file())
            self.assertFalse((mod / "assets/gameplay.json").exists())
            content = json.loads((mod / "content.json").read_text())
            content['resources'] = {'json': {'sample:definitions': 'assets/gameplay.json'}}
            (mod / "content.json").write_text(json.dumps(content))
            content_index = (mod / "content.json").read_bytes()
            seeds = (mod / "assets/gameplay/seeds.json").read_bytes()
            self.run_cli("pack", str(mod), "--out", str(packed), "--publish", str(published))
            archive_bytes = packed.with_suffix(".zip").read_bytes()
            self.assertEqual(published.read_bytes(), archive_bytes)
            self.assertEqual(list(published.parent.iterdir()), [published])

            self.assertFalse((mod / "gameplay" / "node").exists())
            self.assertFalse((mod / "gameplay" / "cocos").exists())
            manifest = json.loads((packed / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["id"], "sample")
            self.assertTrue((packed / "gameplay" / "node" / "index.js").is_file())
            self.assertTrue((packed / "gameplay" / "cocos" / "index.js").is_file())
            self.assertFalse((packed / "src").exists())
            with zipfile.ZipFile(packed.with_suffix(".zip")) as archive:
                self.assertEqual(json.loads(archive.read("packed/manifest.json"))["id"], "sample")
                self.assertIn("packed/gameplay/cocos/index.js", archive.namelist())
                self.assertFalse(any(name.endswith(".ts") for name in archive.namelist()))
                self.assertEqual(json.loads(archive.read("packed/assets/gameplay.json")), {
                    "plants": {}, "seeds": {}, "seedCatalog": [],
                })
                self.assertFalse(any(name.startswith("packed/assets/gameplay/") for name in archive.namelist()))
                self.assertEqual(json.loads(archive.read("packed/content.json"))["resources"], content['resources'])
            self.assertFalse((mod / "assets/gameplay.json").exists())
            self.assertEqual((mod / "content.json").read_bytes(), content_index)
            self.assertEqual((mod / "assets/gameplay/seeds.json").read_bytes(), seeds)

            self.run_cli("test", str(packed))
            self.assertFalse(list(mod.rglob("*.js")))
            (mod / "assets/gameplay/plants.json").unlink()
            with self.assertRaises(subprocess.CalledProcessError):
                self.run_cli("pack", str(mod), "--out", str(packed), "--publish", str(published))
            self.assertEqual(published.read_bytes(), archive_bytes, "failed packing preserves the published package")

    def test_pack_compiles_client_dependencies_and_copies_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            mod, packed = temp / "client-mod", temp / "packed"
            source = mod / "src" / "client"
            images = mod / "assets" / "images"
            bundle = mod / "assets" / "bundles" / "demo"
            for path in [source, images, bundle]:
                path.mkdir(parents=True)
            (mod / "manifest.json").write_text(json.dumps({
                "schemaVersion": 1, "apiVersion": 1, "id": "client-mod",
                "client": {"module": "client/index.js", "bundle": "assets/bundles/demo"},
            }))
            (source / "index.ts").write_text("export { value } from './appearance.js'\n")
            (source / "appearance.ts").write_text("export const value = 'current-source'\n")
            (images / "background.png").write_bytes(b"image-content")
            (bundle / "config.json").write_text("{}")

            self.run_cli("pack", str(mod), "--out", str(packed))

            self.assertFalse(list(mod.rglob("*.js")))
            with zipfile.ZipFile(packed.with_suffix(".zip")) as archive:
                entry = archive.read("packed/client/index.js").decode()
                self.assertIn("System.register", entry)
                self.assertIn("./appearance.js", entry)
                self.assertIn(b"current-source", archive.read("packed/client/appearance.js"))
                self.assertEqual(archive.read("packed/assets/images/background.png"), b"image-content")
                self.assertEqual(archive.getinfo("packed/assets/images/background.png").compress_type, zipfile.ZIP_STORED)
                self.assertEqual(archive.read("packed/assets/bundles/demo/config.json"), b"{}")
                self.assertFalse(any(name.endswith(".ts") for name in archive.namelist()))

    def test_pack_hash_tracks_data_and_ignores_destination_name(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            mod, first, second = temp / "sample", temp / "first", temp / "second"
            self.run_cli("init", "sample", "--out", str(mod))
            source_manifest = (mod / "manifest.json").read_bytes()
            self.run_cli("pack", str(mod), "--out", str(first))
            self.run_cli("pack", str(mod), "--out", str(second))
            before = json.loads((first / "manifest.json").read_text())["contentHash"]
            self.assertEqual(before, json.loads((second / "manifest.json").read_text())["contentHash"])
            self.assertEqual(len(before), 64)
            (mod / "assets" / "gameplay" / "seeds.json").write_text('{"sample:seed":{"plant":"sample:plant"}}')
            self.run_cli("pack", str(mod), "--out", str(first))
            self.assertNotEqual(before, json.loads((first / "manifest.json").read_text())["contentHash"])
            self.assertEqual(source_manifest, (mod / "manifest.json").read_bytes())

    def run_cli(self, *arguments, cwd=ROOT):
        subprocess.run(
            ["node", str(TSX), str(TOOL), *arguments],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
