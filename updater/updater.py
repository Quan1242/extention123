"""Windows Native Messaging host. stdlib only; no CVAT credentials or annotation I/O."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import time
import urllib.parse
import urllib.request
import uuid
import zipfile

REPO = 'ManhLD-LDM/CVAT_Tool'
FILES = frozenset('manifest.json copilot_main.js copilot_panel.js geometry_math.js cvat_adapter.js main_world_bridge.js content_script.js shortcut_settings.js styles.css session_transport.js session_worker.js session.html session.css session.js batch_math.js batch_cloud.js batch_controller.js batch_ui.js THIRD_PARTY_LICENSES.txt cvat_annotations.py update_service.js update_client.js updater_setup.html updater_setup.js'.split())
REQUIRED = FILES - {'update_client.js'}  # client is also bundled in copilot_panel.js
MAX_ZIP = 100 * 1024 * 1024

def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'v?\d+(?:\.\d+){2,3}', value):
        raise ValueError('Invalid version')
    parts = tuple(map(int, value.lstrip('v').split('.')))
    return parts + (0,) * (4 - len(parts))

def allowed_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Unsafe download URL')
    if parsed.hostname == 'api.github.com':
        valid = parsed.path == '/repos/' + REPO + '/releases/latest'
    elif parsed.hostname == 'github.com':
        valid = parsed.path.startswith('/' + REPO + '/releases/download/')
    else:
        valid = parsed.hostname in {'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}
    if not valid:
        raise ValueError('Download outside pinned GitHub repository/CDN')
    return url

class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def download(url, limit=MAX_ZIP):
    allowed_url(url)
    req = urllib.request.Request(url, headers={'User-Agent': 'CVAT-3D-Tool-Updater/1', 'Accept': 'application/vnd.github+json' if 'api.github.com' in url else 'application/octet-stream'})
    with urllib.request.build_opener(Redirect()).open(req, timeout=30) as response:
        allowed_url(response.url)
        chunks, size, deadline = [], 0, time.monotonic() + 120
        while True:
            chunk = response.read(65536)
            if not chunk:
                return b''.join(chunks)
            chunks.append(chunk)
            size += len(chunk)
            if size > limit or time.monotonic() > deadline:
                raise ValueError('Download exceeds size/time limit')

def validate_zip(path, expected):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or not REQUIRED.issubset(names) or not set(names).issubset(FILES):
            raise ValueError('Unexpected/missing package files; no installation')
        if sum(item.file_size for item in archive.infolist()) > 200 * 1024 * 1024:
            raise ValueError('Unpacked package too large')
        for item in archive.infolist():
            if item.file_size > 50 * 1024 * 1024 or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe package entry')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('version') != expected or manifest.get('manifest_version') != 3 or manifest.get('name') != 'CVAT 3D TOOL':
            raise ValueError('Manifest does not match release')

def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError('Truncated message')
    length = struct.unpack('<I', header)[0]
    if length > 65536:
        raise ValueError('Message too large')
    payload = stream.read(length)
    if len(payload) != length:
        raise ValueError('Truncated message')
    return json.loads(payload)

def write_message(stream, value):
    payload = json.dumps(value, ensure_ascii=False).encode('utf-8')
    stream.write(struct.pack('<I', len(payload)) + payload)
    stream.flush()

class Updater:
    def __init__(self, root, fetch=download):
        self.root = Path(root).resolve()
        self.fetch = fetch
        self.target = self.root / 'extension'

    def verify_install(self):
        if (self.root / '.setup.lock').exists():
            raise ValueError('Windows installer is running; wait before updating')
        if not (self.root / 'managed-install.json').is_file() or not self.target.is_dir() or self.target.is_symlink():
            raise ValueError('Use the managed Windows installer first')
        # Never update a source checkout or follow a junction outside the managed root.
        if self.target.resolve() != self.target or (self.root / '.git').exists() or (self.target / '.git').exists():
            raise ValueError('Refusing source checkout or redirected installation')
        for name in ('staging', 'backups'):
            child = self.root / name
            if child.resolve() != child or child.is_symlink():
                raise ValueError('Refusing redirected staging/backup directory')
        return json.loads((self.target / 'manifest.json').read_text(encoding='utf-8-sig'))['version']

    @contextlib.contextmanager
    def lock(self):
        lock = self.root / 'update.lock'
        fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            yield
        finally:
            lock.unlink(missing_ok=True)

    def prepare(self, request):
        current = self.verify_install()
        if current != request.get('currentVersion'):
            raise ValueError('Loaded extension differs from managed installation; Reload current version first')
        release = json.loads(self.fetch('https://api.github.com/repos/' + REPO + '/releases/latest', 2 * 1024 * 1024))
        latest = release.get('tag_name', '').lstrip('v')
        if release.get('draft') or release.get('prerelease') or latest != request.get('version') or version(latest) <= version(current):
            raise ValueError('Release changed or is not newer; check again')
        name = 'CVAT-3D-Tool-Extension-' + latest + '.zip'
        asset = next((a for a in release.get('assets', []) if a.get('name') == name), None)
        if not asset:
            raise ValueError('Release package missing')
        url = asset['browser_download_url']
        if urllib.parse.urlparse(url).hostname != 'github.com':
            raise ValueError('Asset must belong to pinned GitHub release')
        digest = asset.get('digest', '')
        if re.fullmatch(r'sha256:[a-fA-F0-9]{64}', digest or ''):
            expected = digest.split(':')[1].lower()
        else:
            checksums = next((a for a in release.get('assets', []) if a.get('name') == 'SHA256SUMS.txt'), None)
            if not checksums:
                raise ValueError('Release has no SHA-256 digest; publisher must upload SHA256SUMS.txt')
            text = self.fetch(checksums['browser_download_url'], 65536).decode('utf-8')
            expected = next((line.split()[0].lower() for line in text.splitlines() if len(line.split()) == 2 and line.split()[1].lstrip('*') == name), '')
            if not re.fullmatch('[a-f0-9]{64}', expected):
                raise ValueError('Release checksum missing')
        payload = self.fetch(url)
        if hashlib.sha256(payload).hexdigest() != expected:
            raise ValueError('Release checksum mismatch; no files changed')
        token = uuid.uuid4().hex
        stage = self.root / 'staging' / token
        stage.mkdir(parents=True)
        archive = stage / 'package.zip'
        archive.write_bytes(payload)
        validate_zip(archive, latest)
        (stage / 'metadata.json').write_text(json.dumps({'version': latest, 'previous': current, 'sha256': expected, 'created': time.time()}), encoding='utf-8')
        return {'token': token, 'version': latest}

    def commit(self, request):
        token = request.get('token', '')
        if not re.fullmatch('[a-f0-9]{32}', token):
            raise ValueError('Invalid stage token')
        current = self.verify_install()
        stage = self.root / 'staging' / token
        if stage.resolve() != stage:
            raise ValueError('Redirected stage')
        metadata = json.loads((stage / 'metadata.json').read_text(encoding='utf-8'))
        if current != request.get('currentVersion') or current != metadata['previous'] or time.time() - metadata['created'] > 600:
            raise ValueError('Prepared update expired or installed version changed')
        archive = stage / 'package.zip'
        if hashlib.sha256(archive.read_bytes()).hexdigest() != metadata['sha256']:
            raise ValueError('Staged package changed')
        validate_zip(archive, metadata['version'])
        unpacked = stage / 'extension'
        unpacked.mkdir()
        with zipfile.ZipFile(archive) as package:
            package.extractall(unpacked)  # exact flat allowlist validated above
        backup = self.root / 'backups' / (current + '-' + token)
        backup.parent.mkdir(exist_ok=True)
        self.target.rename(backup)
        try:
            unpacked.rename(self.target)
        except Exception:
            backup.rename(self.target)
            raise
        return {'version': metadata['version'], 'backup': str(backup)}

    def handle(self, request):
        if not isinstance(request, dict):
            raise ValueError('Invalid request')
        with self.lock():
            if request.get('action') == 'prepare':
                return self.prepare(request)
            if request.get('action') == 'commit':
                return self.commit(request)
            raise ValueError('Unsupported updater action')

def main():
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    root = Path(sys.executable if getattr(sys, 'frozen', False) else __file__).resolve().parent
    try:
        config = json.loads((root / 'managed-install.json').read_text(encoding='utf-8-sig'))
        if not any(arg in config['allowed_origins'] for arg in sys.argv[1:]):
            raise ValueError('Unexpected caller extension')
        request = read_message(sys.stdin.buffer)
        if request is None:
            return
        result = Updater(root).handle(request)
        write_message(sys.stdout.buffer, {'ok': True, 'result': result})
    except Exception as error:
        write_message(sys.stdout.buffer, {'ok': False, 'error': str(error)[:500]})

if __name__ == '__main__':
    main()
