import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('prune', Path(__file__).with_name('prune-android-releases.py'))
prune = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prune)


class PruneTests(unittest.TestCase):
    def test_redirect_preserves_existing_rules_and_replaces_only_its_own_block(self):
        original = 'Options -Indexes\nHeader always set X-Test yes\n'
        first = prune.routing_rules(original, 'g-shop-android-1.1.33-9.apk')
        second = prune.routing_rules(first, 'g-shop-android-1.1.34-10.apk')
        self.assertTrue(second.startswith(original))
        self.assertNotIn('1.1.33', second)
        self.assertEqual(second.count(prune.START), 1)
        self.assertIn('RewriteCond %{REQUEST_FILENAME} !-f', second)
        with self.assertRaises(ValueError): prune.routing_rules(original, '../other.apk')

    def test_only_own_apks_are_removed_and_current_artifact_and_other_files_survive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            latest = root/'g-shop-android-1.1.33-9.apk'
            old = root/'g-shop-android.apk'
            unrelated = root/'other.apk'
            for path in (latest, old, unrelated, root/'document.pdf'): path.write_bytes(b'fixture')
            (root/'node_modules').mkdir()
            (root/'node_modules/g-shop-android.apk').write_bytes(b'package fixture')
            with patch.object(prune, 'ROOT', root): self.assertEqual(prune.local_candidates(latest), [old])


if __name__ == '__main__': unittest.main()
