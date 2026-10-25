"""Stage generated resources, then use the common Mod packer."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def package_resources(directory: Path, package_id: str, resources: dict) -> Path:
    package_id = package_id if ":" in package_id else "local:" + package_id
    manifest = {
        "schemaVersion": 1, "id": package_id, "version": "1.0.0", "apiVersion": 1,
        "contentHash": "generated-on-pack", "dependencies": [],
    }
    for name, data in [("manifest.json", manifest), ("content.json", {"resources": resources})]:
        (directory / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (directory / "pack.json").unlink(missing_ok=True)
    output = ROOT / "dist/mods" / package_id.split(":", 1)[1]
    subprocess.run(["node", str(ROOT / "tools/mod.mjs"), "pack", str(directory), "--out", str(output)], check=True)
    return Path(str(output) + ".zip")
