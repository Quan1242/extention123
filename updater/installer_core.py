"""Per-user installer operations, separate from GUI and independently testable."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import uuid
import zipfile
from updater import validate_zip, version

HOST = 'net.vantix.cvat3dtool.updater'

def extension_id(path, manifest):
    if manifest.get('key'):
        material = base64.b64decode(manifest['key'], validate=True)
    else:
        # Chromium components/crx_file/id_util.cc: Windows FilePath wide bytes,
        # uppercase drive letter, SHA-256 first 16 bytes -> alphabet a-p.
        normalized = str(path).replace('/', '\\')
        if len(normalized) > 1 and normalized[1] == ':':
            normalized = normalized[0].upper() + normalized[1:]
        material = normalized.encode('utf-16-le')
    return ''.join(chr(ord('a') + int(c, 16)) for c in hashlib.sha256(material).hexdigest()[:32])

def atomic_write(path, data):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_bytes(data)
    os.replace(temp, path)

def register_windows(manifest_path):
    import winreg
    previous = []
    try:
        for browser in ('Microsoft\\Edge', 'Google\\Chrome'):
            key_path = 'Software\\' + browser + '\\NativeMessagingHosts\\' + HOST
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                    old = winreg.QueryValue(key, None)
            except FileNotFoundError:
                old = None
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest_path))
            previous.append((key_path, old))
    except Exception:
        for key_path, old in reversed(previous):
            if old is None:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
            else:
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                    winreg.SetValueEx(key, '', 0, winreg.REG_SZ, old)
        raise

def install(root, payload, register=register_windows):
    root = Path(root).absolute()
    if root.is_symlink() or root.resolve() != root or (root / '.git').exists():
        raise ValueError('Thư mục cài đặt không an toàn; chưa cài.')
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / '.setup.lock'
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise ValueError('Một bộ cài khác đang chạy. Chờ xong rồi thử lại.') from None
    os.close(fd)
    try:
        return _install(root, payload, register)
    finally:
        lock_path.unlink(missing_ok=True)

def _install(root, payload, register):
    root = Path(root).absolute()
    # Reject redirects before resolve: installation must stay at the shown path.
    if root.is_symlink() or root.resolve() != root or (root / '.git').exists():
        raise ValueError('Thư mục cài đặt bị chuyển hướng hoặc là source Git; chưa cài.')
    root.mkdir(parents=True, exist_ok=True)
    if (root / 'update.lock').exists():
        raise ValueError('Updater đang chạy. Chờ xong rồi mở lại bộ cài.')
    target = root / 'extension'
    marker = root / 'managed-install.json'
    if target.exists() and (not marker.is_file() or target.resolve() != target):
        raise ValueError('Thư mục đã có dữ liệu không thuộc bộ cài; giữ nguyên dữ liệu.')
    metadata = json.loads((payload / 'payload.json').read_text(encoding='utf-8'))
    archive = payload / 'extension.zip'
    host_source = payload / 'updater.exe'
    for name, path in [('extension', archive), ('host', host_source)]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != metadata[name + '_sha256']:
            raise ValueError('Bộ cài bị thiếu hoặc sai checksum: ' + name)
    notices = payload / 'THIRD_PARTY_NOTICES.txt'
    if metadata.get('notices_sha256') and hashlib.sha256(notices.read_bytes()).hexdigest() != metadata['notices_sha256']:
        raise ValueError('Runtime license checksum mismatch')
    validate_zip(archive, metadata['version'])
    if host_source.read_bytes()[:2] != b'MZ':
        raise ValueError('Updater không phải Windows executable.')
    with zipfile.ZipFile(archive) as package:
        incoming = json.loads(package.read('manifest.json'))
    if target.exists():
        installed = json.loads((target / 'manifest.json').read_text(encoding='utf-8-sig'))
        if version(installed['version']) > version(incoming['version']):
            raise ValueError('Máy đang có bản mới hơn. Bộ cài này không hạ phiên bản.')
    token = uuid.uuid4().hex
    stage = root / ('setup-' + token)
    stage.mkdir()
    with zipfile.ZipFile(archive) as package:
        package.extractall(stage)
    client_id = extension_id(target, incoming)
    origin = 'chrome-extension://' + client_id + '/'
    host_path = root / ('CVAT-3D-Tool-Updater-' + metadata['version'] + '.exe')
    manifest_path = root / (HOST + '.json')
    notices_target = root / 'THIRD_PARTY_NOTICES.txt'
    previous = {p: p.read_bytes() if p.exists() else None for p in (marker, manifest_path, host_path, notices_target)}
    backup = root / ('before-setup-' + token)
    moved = False
    try:
        atomic_write(host_path, host_source.read_bytes())
        if metadata.get('notices_sha256'):
            atomic_write(notices_target, notices.read_bytes())
        if target.exists():
            target.rename(backup)
            moved = True
        stage.rename(target)
        atomic_write(marker, json.dumps({'allowed_origins': [origin], 'installer_version': metadata['version']}).encode())
        atomic_write(manifest_path, json.dumps({'name': HOST, 'description': 'CVAT 3D TOOL updater', 'path': str(host_path), 'type': 'stdio', 'allowed_origins': [origin]}).encode())
        register(manifest_path)
    except Exception:
        # Preserve directories for diagnosis; restore the prior active copy.
        if target.exists() and not stage.exists():
            target.rename(stage)
        if moved:
            backup.rename(target)
        for path, data in previous.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, data)
        raise
    return {'root': str(root), 'extension': str(target), 'id': client_id, 'version': metadata['version'], 'backup': str(backup) if moved else None}
