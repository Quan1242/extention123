import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest import mock
import zipfile

spec = importlib.util.spec_from_file_location('cvat_updater', Path(__file__).parents[1] / 'updater' / 'updater.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

def package(version='1.15.1', extra=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name in updater.FILES:
            archive.writestr(name, json.dumps({'version': version, 'name': 'CVAT 3D TOOL', 'manifest_version': 3}) if name == 'manifest.json' else '// fixture')
        if extra:
            archive.writestr(extra, 'unsafe')
    return stream.getvalue()

class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        target = self.root / 'extension'
        target.mkdir()
        (target / 'manifest.json').write_text(json.dumps({'version': '1.15.0'}))
        (target / 'old.txt').write_text('preserve old installation')
        (self.root / 'managed-install.json').write_text('{}')

    def host(self, payload=None, digest=None):
        payload = payload or package()
        asset = 'CVAT-3D-Tool-Extension-1.15.1.zip'
        release = {'tag_name': 'v1.15.1', 'assets': [{'name': asset, 'browser_download_url': 'https://github.com/' + updater.REPO + '/releases/download/v1.15.1/' + asset, 'digest': 'sha256:' + (digest or hashlib.sha256(payload).hexdigest())}]}
        return updater.Updater(self.root, fetch=lambda url, limit=updater.MAX_ZIP: json.dumps(release).encode() if 'api.github.com' in url else payload)

    def prepare(self, host):
        return host.handle({'action': 'prepare', 'currentVersion': '1.15.0', 'version': '1.15.1'})

    def test_native_binary_framing_handles_unicode(self):
        stream = io.BytesIO()
        updater.write_message(stream, {'status': 'Đã lưu'})
        stream.seek(0)
        self.assertEqual(updater.read_message(stream), {'status': 'Đã lưu'})
        with self.assertRaises(ValueError):
            updater.read_message(io.BytesIO(b'\x10\x00\x00\x00{}'))

    def test_prepare_does_not_change_installed_files_commit_retains_backup(self):
        host = self.host()
        staged = self.prepare(host)
        self.assertTrue((self.root / 'extension' / 'old.txt').exists())
        result = host.handle({'action': 'commit', 'token': staged['token'], 'currentVersion': '1.15.0'})
        self.assertEqual(result['version'], '1.15.1')
        self.assertEqual(json.loads((self.root / 'extension' / 'manifest.json').read_text())['version'], '1.15.1')
        self.assertTrue((Path(result['backup']) / 'old.txt').exists())

    def test_checksum_mismatch_preserves_install(self):
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.prepare(self.host(digest='0' * 64))
        self.assertTrue((self.root / 'extension' / 'old.txt').exists())

    def test_traversal_and_unexpected_files_are_rejected(self):
        for extra in ['../outside.txt', 'extension/manifest.json', '/absolute.txt', 'unexpected.exe']:
            with self.assertRaisesRegex(ValueError, 'package files'):
                self.prepare(self.host(package(extra=extra)))
        self.assertFalse((self.root.parent / 'outside.txt').exists())

    def test_wrong_package_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Manifest'):
            self.prepare(self.host(package(version='9.0.0')))

    def test_staged_tampering_is_rejected(self):
        host = self.host()
        staged = self.prepare(host)
        (self.root / 'staging' / staged['token'] / 'package.zip').write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'changed'):
            host.handle({'action': 'commit', 'token': staged['token'], 'currentVersion': '1.15.0'})
        self.assertTrue((self.root / 'extension' / 'old.txt').exists())

    def test_failed_swap_restores_original_directory(self):
        host = self.host()
        staged = self.prepare(host)
        rename = Path.rename
        def fail_new(path, target):
            if path.parent.name == staged['token']:
                raise OSError('injected directory swap failure')
            return rename(path, target)
        with mock.patch.object(Path, 'rename', fail_new), self.assertRaises(OSError):
            host.handle({'action': 'commit', 'token': staged['token'], 'currentVersion': '1.15.0'})
        self.assertTrue((self.root / 'extension' / 'old.txt').exists())

    def test_unsafe_urls_and_stage_tokens_are_rejected(self):
        for url in ['http://github.com/' + updater.REPO + '/releases/download/v1/a.zip', 'https://evil.test/a.zip', 'https://github.com/another/repo/releases/download/v1/a.zip']:
            with self.assertRaises(ValueError):
                updater.allowed_url(url)
        with self.assertRaisesRegex(ValueError, 'token'):
            self.host().handle({'action': 'commit', 'token': '../bad'})

    def test_installed_version_mismatch_blocks_update(self):
        with self.assertRaisesRegex(ValueError, 'differs'):
            self.host().handle({'action': 'prepare', 'currentVersion': '1.14.7', 'version': '1.15.1'})

    def test_actual_host_process_uses_binary_protocol_and_checks_caller_origin(self):
        origin = 'chrome-extension://' + 'a' * 32 + '/'
        (self.root / 'managed-install.json').write_text(json.dumps({'allowed_origins': [origin]}))
        script = self.root / 'updater.py'
        script.write_bytes(Path(updater.__file__).read_bytes())
        message = io.BytesIO()
        updater.write_message(message, {'action': 'invalid'})
        for caller, expected in [(origin, 'Unsupported updater action'), ('chrome-extension://' + 'b' * 32 + '/', 'Unexpected caller')]:
            process = subprocess.run([sys.executable, str(script), caller], input=message.getvalue(), capture_output=True, timeout=10)
            response = updater.read_message(io.BytesIO(process.stdout))
            self.assertEqual(response['ok'], False)
            self.assertIn(expected, response['error'])
            self.assertEqual(process.returncode, 0)

if __name__ == '__main__':
    unittest.main()
