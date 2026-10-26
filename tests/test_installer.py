import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parents[1] / 'updater'))
from installer_core import install, extension_id
from updater import FILES

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'managed'
        self.payload = self.base / 'payload'
        self.payload.mkdir()
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            for name in FILES:
                archive.writestr(name, json.dumps({'version': '1.15.1', 'name': 'CVAT 3D TOOL', 'manifest_version': 3}) if name == 'manifest.json' else 'fixture')
        blob = stream.getvalue()
        (self.payload / 'extension.zip').write_bytes(blob)
        (self.payload / 'updater.exe').write_bytes(b'MZ fixture executable')
        (self.payload / 'payload.json').write_text(json.dumps({'version': '1.15.1', 'extension_sha256': hashlib.sha256(blob).hexdigest(), 'host_sha256': hashlib.sha256(b'MZ fixture executable').hexdigest()}))
        self.registered = []

    def run_install(self):
        return install(self.root, self.payload, register=lambda p: self.registered.append(p))

    def test_install_registers_both_tool_and_native_host_without_id_input(self):
        result = self.run_install()
        self.assertEqual(result['version'], '1.15.1')
        self.assertEqual(len(result['id']), 32)
        host = json.loads(self.registered[0].read_text())
        self.assertEqual(host['allowed_origins'], ['chrome-extension://' + result['id'] + '/'])
        self.assertTrue(Path(host['path']).is_file())
        self.assertEqual(Path(host['path']).parent, self.root)
        self.assertFalse((self.root / '.setup.lock').exists())

    def test_repair_preserves_previous_directory_and_same_extension_id(self):
        first = self.run_install()
        (self.root / 'extension' / 'existing.txt').write_text('preserve me')
        second = self.run_install()
        self.assertEqual(first['id'], second['id'])
        self.assertEqual((Path(second['backup']) / 'existing.txt').read_text(), 'preserve me')

    def test_corrupted_payload_does_not_install(self):
        (self.payload / 'updater.exe').write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_install()
        self.assertFalse((self.root / 'extension').exists())
        self.assertFalse(self.registered)

    def test_registration_failure_restores_previous_install_and_config(self):
        self.run_install()
        (self.root / 'extension' / 'existing.txt').write_text('preserve me')
        marker = (self.root / 'managed-install.json').read_bytes()
        def fail(_):
            raise PermissionError('injected registry failure')
        with self.assertRaises(PermissionError):
            install(self.root, self.payload, register=fail)
        self.assertEqual((self.root / 'extension' / 'existing.txt').read_text(), 'preserve me')
        self.assertEqual((self.root / 'managed-install.json').read_bytes(), marker)
        self.assertFalse((self.root / '.setup.lock').exists())

    def test_unmanaged_existing_folder_is_never_overwritten(self):
        (self.root / 'extension').mkdir(parents=True)
        (self.root / 'extension' / 'user.txt').write_text('preserve me')
        with self.assertRaisesRegex(ValueError, 'dữ liệu'):
            self.run_install()
        self.assertEqual((self.root / 'extension' / 'user.txt').read_text(), 'preserve me')

    def test_downgrade_is_refused(self):
        self.run_install()
        path = self.root / 'extension' / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['version'] = '9.0.0'
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'mới hơn'):
            self.run_install()
        self.assertEqual(json.loads(path.read_text())['version'], '9.0.0')

    def test_busy_installer_does_not_remove_another_process_lock(self):
        self.root.mkdir()
        lock = self.root / '.setup.lock'
        lock.write_text('another process')
        with self.assertRaisesRegex(ValueError, 'khác đang chạy'):
            self.run_install()
        self.assertEqual(lock.read_text(), 'another process')

    def test_windows_id_normalizes_only_drive_case_and_supports_unicode(self):
        path = r'C:\Users\Người Dùng\AppData\Local\CVAT-3D-Tool\extension'
        expected = ''.join(chr(97 + int(c, 16)) for c in hashlib.sha256(path.encode('utf-16-le')).hexdigest()[:32])
        self.assertEqual(extension_id(path, {}), expected)
        self.assertEqual(extension_id('c:' + path[2:], {}), expected)
        self.assertNotEqual(extension_id(path + 'other', {}), expected)

if __name__ == '__main__':
    unittest.main()
