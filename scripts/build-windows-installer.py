"""Build standalone Windows host + GUI setup. Build dependency: PyInstaller."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import importlib.metadata

ROOT = Path(__file__).resolve().parents[1]

def main():
    if os.name != 'nt':
        raise SystemExit('Build this installer on Windows x64.')
    subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'scripts/package-extension.ps1')], cwd=ROOT, check=True)
    metadata = json.loads((ROOT / 'extension/manifest.json').read_text())
    version = metadata['version']
    work = (ROOT / 'build/windows-installer').resolve()
    dist = (ROOT / 'dist').resolve()
    # PyInstaller can replace generated output; constrain every output directory.
    assert work.is_relative_to(ROOT) and dist.is_relative_to(ROOT)
    work.mkdir(parents=True, exist_ok=True)
    common = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--noupx', '--specpath', str(work)]
    subprocess.run(common + ['--console', '--name', 'CVAT-3D-Tool-Updater', '--distpath', str(dist / 'native-host'), '--workpath', str(work / 'host'), str(ROOT / 'updater/updater.py')], cwd=ROOT, check=True)
    payload = work / 'payload'
    payload.mkdir(exist_ok=True)
    shutil.copyfile(dist / ('CVAT-3D-Tool-Extension-' + version + '.zip'), payload / 'extension.zip')
    shutil.copyfile(dist / 'native-host/CVAT-3D-Tool-Updater.exe', payload / 'updater.exe')
    license_paths = [Path(sys.base_prefix) / 'LICENSE.txt', Path(sys.base_prefix) / 'tcl/tk8.6/license.terms']
    distribution = importlib.metadata.distribution('pyinstaller')
    license_paths += [Path(distribution.locate_file(f)) for f in distribution.files if str(f).endswith('/licenses/COPYING.txt')]
    notices = '\n\n'.join('=== ' + p.name + ' ===\n' + p.read_text(encoding='utf-8', errors='replace') for p in license_paths if p.is_file())
    if not (Path(sys.base_prefix) / 'LICENSE.txt').is_file():
        raise SystemExit('Python redistribution license missing; do not publish this setup.')
    (payload / 'THIRD_PARTY_NOTICES.txt').write_text(notices, encoding='utf-8')
    (payload / 'payload.json').write_text(json.dumps({'version': version, 'extension_sha256': hashlib.sha256((payload / 'extension.zip').read_bytes()).hexdigest(), 'host_sha256': hashlib.sha256((payload / 'updater.exe').read_bytes()).hexdigest(), 'notices_sha256': hashlib.sha256((payload / 'THIRD_PARTY_NOTICES.txt').read_bytes()).hexdigest()}), encoding='utf-8')
    name = 'CVAT-3D-Tool-Setup'
    subprocess.run(common + ['--windowed', '--name', name, '--distpath', str(dist), '--workpath', str(work / 'gui'), '--add-data', str(payload) + ';payload', str(ROOT / 'updater/installer.py')], cwd=ROOT, check=True)
    assets = [dist / ('CVAT-3D-Tool-Extension-' + version + '.zip'), dist / 'CVAT-3D-Tool-Updater-Windows.zip', dist / (name + '.exe')]
    (dist / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in assets), encoding='ascii')
    print('Built standalone installer:', assets[-1])

if __name__ == '__main__':
    main()
