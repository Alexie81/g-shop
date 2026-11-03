"""Offline release transaction tests. Uses PHP CLI and temporary local files only."""

import argparse
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

SPEC = importlib.util.spec_from_file_location('publish_release', Path(__file__).with_name('publish-android-release.py'))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


@unittest.skipUnless(shutil.which('php'), 'PHP CLI is required for server transaction tests.')
class ReleaseTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.api = self.root / 'app-api'
        self.download = self.root / 'download-app'
        self.api.mkdir()
        self.download.mkdir()
        self.env = (
            b'# Keep comments and CRLF exactly\r\nDB_NAME=migrated-db\r\nDB_PASS="synthetic-only"\r\n'
            b'APP_ANDROID_VERSION=1.0.0\r\nAPP_ANDROID_BUILD_NUMBER=1\r\n'
            b'APP_ANDROID_VERSION=duplicate-old-value\r\nAPP_KEY=synthetic-key\r\nLAST_SETTING=no-newline'
        )
        (self.api / '.env').write_bytes(self.env)
        (self.download / 'g-shop-android.apk').write_bytes(b'previous apk')
        (self.download / 'app.js').write_bytes(b'previous page script')
        artifact = self.root / 'finished.apk'
        with zipfile.ZipFile(artifact, 'w') as archive:
            archive.writestr('AndroidManifest.xml', b'test manifest')
            archive.writestr('classes.dex', b'test classes')
        script = self.root / 'app.js'
        script.write_text('/* new download resolver */', encoding='utf-8')
        args = argparse.Namespace(artifact=artifact, download_script=script, version='1.2.3', build=99,
                                  notes=['Curățare și semnături', 'Corecții'], notes_file=None, mandatory=False)
        self.artifact, self.script, self.manifest = release.release_manifest(args, 'offline-test')
        shutil.copyfile(artifact, self.download / self.manifest['apkStage'])
        shutil.copyfile(script, self.download / self.manifest['scriptStage'])
        token = 'offline-test-token'
        helper = release.render_helper(self.manifest, token).decode()
        helper = helper.replace('<?php\ndeclare(strict_types=1);',
                                '<?php\ndeclare(strict_types=1);\n$_SERVER["REQUEST_METHOD"]="POST";'
                                f'$_SERVER["HTTP_X_DEPLOY_TOKEN"]="{token}";')
        helper = helper.replace("file_get_contents('php://input')", "file_get_contents(__DIR__.'/request.json')")
        self.helper = self.api / 'helper.php'
        self.helper.write_text(helper, encoding='utf-8')

    def call(self, action, **fields):
        (self.api / 'request.json').write_text(json.dumps({'action': action, **fields}), encoding='utf-8')
        result = subprocess.run(['php', str(self.helper)], capture_output=True, text=True, check=True)
        self.assertFalse(result.stderr, result.stderr)
        return json.loads(result.stdout)

    def commit(self):
        return self.call('commit', verifiedSha256=self.manifest['apkHash'], verifiedSize=self.manifest['apkSize'])

    def test_stage_cannot_change_metadata_and_commit_requires_verification(self):
        self.assertEqual(self.call('stage')['status'], 'staged')
        self.assertEqual((self.api / '.env').read_bytes(), self.env)
        self.assertEqual((self.download / 'g-shop-android.apk').read_bytes(), b'previous apk')
        self.assertIn('verification', self.call('commit')['error'])
        self.assertEqual((self.api / '.env').read_bytes(), self.env)

    def test_commit_preserves_unrelated_configuration_and_rollback_restores_every_file(self):
        self.call('stage')
        self.assertEqual(self.commit()['status'], 'committed')
        updated = (self.api / '.env').read_bytes()
        before_other = [line for line in self.env.split(b'\r\n') if not line.startswith(b'APP_ANDROID_')]
        after_other = [line for line in updated.split(b'\r\n') if line and not line.startswith(b'APP_ANDROID_')]
        self.assertEqual(after_other, before_other)
        for key, value in self.manifest['metadata'].items():
            self.assertIn(f'{key}={value}'.encode(), updated)
        self.assertEqual(updated.count(b'APP_ANDROID_VERSION=1.2.3'), 2)
        self.assertEqual((self.download / 'g-shop-android.apk').read_bytes(), self.artifact.read_bytes())
        self.assertEqual((self.download / 'app.js').read_bytes(), self.script.read_bytes())
        self.assertEqual(self.call('rollback')['status'], 'rolled-back')
        self.assertEqual((self.api / '.env').read_bytes(), self.env)
        self.assertEqual((self.download / 'g-shop-android.apk').read_bytes(), b'previous apk')
        self.assertEqual((self.download / 'app.js').read_bytes(), b'previous page script')

    def test_concurrent_configuration_edit_blocks_commit(self):
        self.call('stage')
        changed = self.env + b'\r\nDB_HOST=changed-during-upload\r\n'
        (self.api / '.env').write_bytes(changed)
        self.assertIn('Environment changed', self.commit()['error'])
        self.assertEqual((self.api / '.env').read_bytes(), changed)
        self.assertEqual((self.download / 'g-shop-android.apk').read_bytes(), b'previous apk')

    def test_existing_versioned_apk_cannot_be_overwritten_with_different_bytes(self):
        target = self.download / self.manifest['apkName']
        target.write_bytes(b'conflicting published artifact')
        self.assertIn('integrity', self.call('stage')['error'])
        self.assertEqual(target.read_bytes(), b'conflicting published artifact')
        self.assertEqual((self.api / '.env').read_bytes(), self.env)

    def test_stage_blocks_a_candidate_older_than_the_server_build(self):
        changed = self.env.replace(b'APP_ANDROID_BUILD_NUMBER=1\r\n', b'APP_ANDROID_BUILD_NUMBER=100\r\n')
        (self.api / '.env').write_bytes(changed)
        self.assertIn('newer', self.call('stage')['error'])
        self.assertFalse((self.download / self.manifest['apkName']).exists())
        self.assertEqual((self.api / '.env').read_bytes(), changed)

    def test_rollback_refuses_to_clobber_later_configuration_changes(self):
        self.call('stage')
        self.commit()
        changed = (self.api / '.env').read_bytes() + b'EXTERNAL_SETTING=keep\r\n'
        (self.api / '.env').write_bytes(changed)
        self.assertIn('Rollback conflict', self.call('rollback')['error'])
        self.assertEqual((self.api / '.env').read_bytes(), changed)


class HttpsVerificationTests(unittest.TestCase):
    def test_preflight_rejects_equal_and_older_builds(self):
        for candidate in [99, 100]:
            with self.assertRaisesRegex(RuntimeError, 'newer'):
                release.check_newer_build(candidate, {'latestBuildNumber': 100})
        release.check_newer_build(101, {'latestBuildNumber': 100})

    def test_wrong_public_bytes_do_not_produce_a_commit_verification(self):
        response = io.BytesIO(b'incorrect artifact')
        response.status = 200
        response.url = release.BASE_URL + '/download-app/test.apk'
        with mock.patch.object(release.urllib.request, 'urlopen', return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                release.verify_https(response.url, '0' * 64, len(b'incorrect artifact'))


if __name__ == '__main__':
    unittest.main()
