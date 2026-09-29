#!/usr/bin/env python3
"""Wrap an existing cross-built Mac app without signing or modifying it.

Requires mkfs.hfsplus, fsck.hfsplus and a local Mozilla libdmg-hfsplus build:
git clone https://github.com/mozilla/libdmg-hfsplus .local/dmg-tools/libdmg-hfsplus
git -C .local/dmg-tools/libdmg-hfsplus checkout ec239599c1f234a4e01ae3fe51214d0c77e5baa3
cmake -S .local/dmg-tools/libdmg-hfsplus -B .local/dmg-tools/build -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build .local/dmg-tools/build -j4
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ARCH = sys.argv[1] if len(sys.argv) in (2, 3) else ''
ADHOC = len(sys.argv) == 3 and sys.argv[2] == '--adhoc'
if len(sys.argv) == 3 and not ADHOC:
    sys.exit('Unknown option; use --adhoc only for a freshly ad-hoc signed app.')
if ARCH not in ('arm64', 'x64'):
    sys.exit('Usage: python3 scripts/package-unsigned-dmg.py arm64|x64 [--adhoc]')
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
APP = ROOT / f'out/Axiovela Math-darwin-{ARCH}/Axiovela Math.app'
HFS = ROOT / '.local/dmg-tools/build/hfs/hfsplus'
DMG = ROOT / '.local/dmg-tools/build/dmg/dmg'
DEST = ROOT / f'out/installers/darwin-{ARCH}/Axiovela-Math-{VERSION}-darwin-{ARCH}-{"adhoc" if ADHOC else "unsigned"}.dmg'
if not APP.is_dir() or not HFS.is_file() or not DMG.is_file():
    sys.exit('Existing Mac app and local DMG tools required; see script docstring.')
if DEST.exists():
    sys.exit(f'Refusing to overwrite {DEST}')
tool_commit = subprocess.check_output(['git', '-C', str(ROOT / '.local/dmg-tools/libdmg-hfsplus'), 'rev-parse', 'HEAD'], text=True).strip()
if tool_commit != 'ec239599c1f234a4e01ae3fe51214d0c77e5baa3':
    sys.exit('DMG tool source differs from the pinned revision; rebuild the documented revision.')

def inventory(root):
    entries = {}
    for parent, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            path = Path(parent) / name
            info = path.lstat()
            key = str(path.relative_to(root))
            if path.is_symlink():
                entries[key] = ['link', os.readlink(path)]
            elif path.is_file():
                entries[key] = ['file', stat.S_IMODE(info.st_mode), hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()]
            else:
                entries[key] = ['directory', stat.S_IMODE(info.st_mode)]
    return entries

if ADHOC and not (APP / 'Contents/_CodeSignature/CodeResources').is_file():
    sys.exit('Ad-hoc input requires a resource seal; sign and verify the final app first.')
original = inventory(APP)
workroot = ROOT / '.local/dmg-tools'
with tempfile.TemporaryDirectory(prefix=f'{ARCH}-', dir=workroot) as temporary:
    work = Path(temporary)
    log = workroot / f'{ARCH}-build.log'
    with log.open('w') as output:
        def run(*args):
            subprocess.run([str(arg) for arg in args], check=True, stdout=output, stderr=subprocess.STDOUT)
        stage = work / 'stage'
        stage.mkdir()
        shutil.copytree(APP, stage / APP.name, symlinks=True)
        (stage / 'Applications').symlink_to('/Applications')
        (stage / 'INSTALL.txt').write_text('Axiovela Math unsigned development build\n\nCopy Axiovela Math.app to Applications.\nThis app is not Developer ID signed or notarized. Native macOS launch and Gatekeeper validation remain pending.\n')
        raw = work / 'volume.hfs'
        size = sum(p.stat().st_size for p in APP.rglob('*') if p.is_file() and not p.is_symlink())
        with raw.open('wb') as stream:
            stream.truncate(((size * 2 + 128 * 1024**2) // 4096 + 1) * 4096)
        run('mkfs.hfsplus', '-v', 'Axiovela Math', raw)
        run(HFS, '--symlinks', 'clone_link', '--special-modes', 'no', raw, 'addall', stage)
        run('fsck.hfsplus', '-fn', raw)
        packed = work / 'installer.dmg'
        run(DMG, 'build', raw, packed)
        with packed.open('rb') as stream:
            stream.seek(-512, 2)
            assert stream.read(4) == b'koly', 'Missing UDIF trailer'
        recovered = work / 'recovered.hfs'
        run(DMG, 'extract', packed, recovered)
        run('fsck.hfsplus', '-fn', recovered)
        extracted = work / 'extracted'
        extracted.mkdir()
        run(HFS, recovered, 'extractall', '/', extracted)
        actual = inventory(extracted / APP.name)
        differences = [key for key in original.keys() | actual.keys() if original.get(key) != actual.get(key)]
        assert not differences, f'App content/permissions/links changed: {differences[:20]}'
        assert (extracted / 'Applications').is_symlink()
        assert os.readlink(extracted / 'Applications') == '/Applications'
        assert inventory(APP) == original, 'Source app changed'
        DEST.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents accidental replacement of a release artifact.
        with packed.open('rb') as source, DEST.open('xb') as target:
            shutil.copyfileobj(source, target)
    report = {'artifact': str(DEST), 'sha256': hashlib.file_digest(DEST.open('rb'), 'sha256').hexdigest(), 'appEntriesVerified': len(original), 'checks': ['UDIF trailer', 'HFS+ fsck before/after compression', 'round-trip files, modes, symlinks', 'source app unchanged'], 'nativeMacValidation': False, 'signed': ADHOC, 'notarized': False, 'toolCommit': 'ec239599c1f234a4e01ae3fe51214d0c77e5baa3'}
    DEST.with_suffix('.dmg.validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
