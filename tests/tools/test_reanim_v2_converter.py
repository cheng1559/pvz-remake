import hashlib
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

import sys

sys.path.insert(0, str(Path(__file__).parents[2] / "tools"))

from reanim_converter import build_reanim_clip_v2, build_reanim_v2, parse_track_data, write_reanim_v2


class ReanimV2ConverterTest(unittest.TestCase):
    def test_inherits_frames_and_writes_deterministically(self):
        source = Path(__file__).parents[2] / "tools" / "fixtures" / "reanim-v2" / "phase2.reanim"
        sprites = {"pvz:phase2_checker"}
        data = build_reanim_v2(source, "pvz:phase2", sprites)

        root = ElementTree.fromstring(f"<root>{source.read_text(encoding='utf-8')}</root>")
        self.assertEqual(len(parse_track_data(root.findall("track")[0])[2]), 2)

        self.assertEqual(data["schemaVersion"], 2)
        self.assertEqual(data["durationSeconds"], 0.3)
        self.assertEqual([track["id"] for track in data["tracks"]], ["back", "face"])
        inherited = data["tracks"][0]["keyframes"][1]
        self.assertEqual((inherited["x"], inherited["y"]), (-4.0, 2.0))
        self.assertEqual(inherited["sprite"], "pvz:phase2_checker")
        hidden = data["tracks"][0]["keyframes"][2]
        self.assertEqual((hidden["timeSeconds"], hidden["sprite"]), (0.2, None))
        reactivated = data["tracks"][1]["keyframes"][2]
        self.assertEqual((reactivated["x"], reactivated["y"]), (3.0, 4.0))
        self.assertEqual(reactivated["scaleX"], 0.5)

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "phase2.json"
            first_hash = write_reanim_v2(source, output, "pvz:phase2", sprites)
            first_bytes = output.read_bytes()
            self.assertEqual(first_hash, hashlib.sha256(first_bytes).hexdigest())
            second_hash = write_reanim_v2(source, output, "pvz:phase2", sprites)
            self.assertEqual((first_hash, first_bytes), (second_hash, output.read_bytes()))

        with self.assertRaisesRegex(ValueError, "missing sprite references: pvz:phase2_checker"):
            build_reanim_v2(source, "pvz:phase2", set())

    def test_extracts_one_clip_with_zero_based_seconds(self):
        source = Path(__file__).parents[2] / "tools" / "fixtures" / "reanim-v2" / "phase2.reanim"
        data = build_reanim_clip_v2(
            source,
            {"body": {"animations": ["back"], "slots": []}},
            "body",
            "back",
            "pvz:phase2_clip",
            {"pvz:phase2_checker"},
        )
        self.assertEqual(data["durationSeconds"], 0.2)
        self.assertEqual([track["id"] for track in data["tracks"]], ["back", "face"])
        self.assertEqual(data["tracks"][0]["keyframes"][0]["timeSeconds"], 0)

    def test_excludes_configured_hidden_track_prefixes(self):
        source = Path(__file__).parents[2] / "tools" / "fixtures" / "reanim-v2" / "phase2.reanim"
        data = build_reanim_clip_v2(
            source,
            {"body": {"animations": ["back"], "slots": [], "hiddenTrackPrefixes": ["face"]}},
            "body",
            "back",
            "pvz:back",
            {"pvz:phase2_checker"},
        )
        self.assertNotIn("face", {track["id"] for track in data["tracks"]})


if __name__ == "__main__":
    unittest.main()
