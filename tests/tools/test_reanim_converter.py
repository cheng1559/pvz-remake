import unittest
from pathlib import Path
from xml.etree import ElementTree

import sys

sys.path.insert(0, str(Path(__file__).parents[2] / "tools"))

from pvz.reanim import build_reanim_clip, parse_track_data, get_anim_nodes


class ReanimConverterTest(unittest.TestCase):

    def test_marker_discovery_preserves_explicit_clip_selection(self):
        xml = ElementTree.fromstring('<root><fps>10</fps>\n<track><name>anim_idle</name><t><f>0</f></t><t/><t><f>-1</f></t></track>\n<track><name>anim_shoot</name><t><f>-1</f></t><t/><t><f>0</f></t></track>\n<track><name>body</name><t><i>IMAGE_REANIM_BODY</i></t><t/><t/></track></root>')
        automatic = get_anim_nodes('example', {'body': {}}, xml)
        explicit = get_anim_nodes('example', {'body': {'slots': [], 'animations': ['anim_idle', 'anim_shoot']}}, xml)
        self.assertEqual(automatic, explicit)
        selected = get_anim_nodes('example', {'body': {'animations': ['anim_idle']}}, xml)
        self.assertEqual(list(selected['body']['animations']), ['anim_idle'])

    def test_track_images_use_converted_file_names(self):
        track = ElementTree.fromstring('<track><name>arm</name><t><i>IMAGE_REANIM_TANGLEKELP_ARM 8</i></t></track>')
        self.assertEqual(parse_track_data(track)[2][0]["image"], "tanglekelp_arm_8")

    def test_extracts_one_clip_with_zero_based_seconds(self):
        source = Path(__file__).parents[2] / "tests" / "fixtures" / "reanim" / "phase2.reanim"
        data = build_reanim_clip(
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
        source = Path(__file__).parents[2] / "tests" / "fixtures" / "reanim" / "phase2.reanim"
        data = build_reanim_clip(
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
