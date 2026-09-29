import {packager} from '@electron/packager';
import {build, Platform, Arch} from 'electron-builder';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {desktopTarget, runtimeFile} from './desktop-targets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const args = process.argv.slice(2), target = desktopTarget(args[0] === 'mac' ? `darwin-${process.platform === 'darwin' ? process.arch : 'arm64'}` : args[0]);
if (args.slice(1).some(arg => arg !== '--dmg')) throw Error('Only TARGET and --dmg are accepted. Publishing is disabled.');
const dmg = args.includes('--dmg');
if (dmg && (process.platform !== 'darwin' || target.platform !== 'darwin')) throw Error('DMG creation and macOS signing require a Mac. Build the app ZIP on this host instead.');
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit', ...options});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`${command} exited ${code}`)));
  });
}
const cache = path.resolve('.local/desktop-tools', target.name);
await fs.mkdir(cache, {recursive: true});
const archive = path.join(cache, path.basename(new URL(target.url).pathname));
let bytes = await fs.readFile(archive).catch(() => null);
if (!bytes || sha256(bytes) !== target.sha256) {
  console.log(`Downloading pinned Tectonic for ${target.name}`);
  const response = await fetch(target.url, {signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw Error(`Tectonic download failed (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== target.sha256) throw Error('Tectonic archive checksum mismatch. Nothing was packaged.');
  await fs.writeFile(archive, bytes);
}
const extracted = path.join(cache, 'extracted');
await fs.rm(extracted, {recursive: true, force: true});
await fs.mkdir(extracted);
if (target.platform === 'win32') {
  const {extract} = await import('@electron-internal/extract-zip');
  await extract(archive, {dir: extracted});
} else await run('tar', ['-xzf', archive, '-C', extracted]);
const binary = path.join(extracted, target.binary);
await fs.access(binary);
await fs.chmod(binary, 0o755);
const tool = {version: 'Tectonic 0.17.0', target: target.name, url: target.url, sha256: target.sha256, binarySha256: sha256(await fs.readFile(binary))};
if (process.platform === target.platform && process.arch === target.arch) await run(binary, ['--version']);

const stage = path.resolve('.local', `stage-${target.name}`);
await fs.rm(stage, {recursive: true, force: true});
await fs.mkdir(stage, {recursive: true});
// Newly reviewed runtime files must be staged in Git before packaging. Never
// sweep arbitrary untracked files into a distributable.
const sourceFiles = execFileSync('git', ['ls-files', '-z', '--cached'], {encoding: 'utf8'}).split('\0').filter(runtimeFile);
for (const name of sourceFiles) {
  await fs.mkdir(path.dirname(path.join(stage, name)), {recursive: true});
  await fs.copyFile(name, path.join(stage, name));
}
await fs.cp('dist', path.join(stage, 'dist'), {recursive: true});
await fs.mkdir(path.join(stage, 'desktop/tools'), {recursive: true});
await fs.copyFile(binary, path.join(stage, 'desktop/tools', target.binary));
await fs.writeFile(path.join(stage, 'desktop/tools/build.json'), JSON.stringify(tool, null, 2) + '\n');
const runtimePkg = Object.fromEntries(['name', 'version', 'description', 'productName', 'desktopName', 'author', 'license', 'type', 'main', 'dependencies'].map(key => [key, pkg[key]]));
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(runtimePkg, null, 2));
await fs.copyFile('package-lock.json', path.join(stage, 'package-lock.json'));
// Invoke npm through Node so native Windows builds don't depend on spawning .cmd.
const npm = process.env.npm_execpath;
if (!npm) throw Error('Use npm run desktop:package:windows or desktop:package:mac so the npm runtime is explicit.');
await run(process.execPath, [npm, 'ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: stage});
await fs.rm(path.join(stage, 'package-lock.json'));
const allFiles = await fs.readdir(path.join(stage, 'node_modules'), {recursive: true});
if (allFiles.some(name => /\.(node|dll|so|dylib)$/.test(name))) throw Error('Native runtime dependency found. Review cross-compilation before packaging.');
const nativeMac = process.platform === 'darwin' && target.platform === 'darwin';
// File Provider-managed folders can immediately reattach Finder metadata that
// invalidates a signed bundle. Assemble native Mac apps on the system volume.
const packageOutput = nativeMac ? await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-math-packaged-')) : 'out';
// Packager cleans its temporary root. Different targets must never share it.
const temporary = path.resolve('.local', `packager-${target.name}`);
await fs.mkdir(temporary, {recursive: true});
const [appDir] = await packager({
  dir: stage, name: pkg.productName, executableName: 'axiovela-math',
  platform: target.platform, arch: target.arch, electronVersion: pkg.devDependencies.electron,
  appBundleId: 'org.axiovela.math', appVersion: pkg.version, appCopyright: 'Copyright © Cash Bowman',
  icon: path.resolve(`desktop/icons/math.${target.platform === 'win32' ? 'ico' : 'icns'}`), tmpdir: temporary, out: packageOutput, overwrite: true, prune: false, asar: false,
});
// Failed builds must not leave a partial installer among deliverable artifacts.
const destination = path.resolve('out/installers', target.name);
const installers = path.resolve('.local', `installers-${target.name}`);
await fs.rm(installers, {recursive: true, force: true});
await fs.mkdir(installers, {recursive: true});
const stem = `Axiovela-Math-${pkg.version}-${target.name}`;
if (target.platform === 'win32') {
  await build({prepackaged: appDir, targets: Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64), publish: 'never', config: {
    appId: 'org.axiovela.math', productName: pkg.productName, asar: false,
    directories: {output: installers}, forceCodeSigning: false,
    win: {icon: 'desktop/icons/math.ico', executableName: 'axiovela-math', signAndEditExecutable: false, artifactName: stem + '-unsigned.${ext}'},
    nsis: {oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, runAfterFinish: false, createDesktopShortcut: true, shortcutName: pkg.productName, installerIcon: 'desktop/icons/math.ico', uninstallerIcon: 'desktop/icons/math.ico'},
  }});
} else {
  const app = path.join(appDir, `${pkg.productName}.app`);
  // Cross-built bundles contain linker signatures that do not seal resources.
  // Replace them only after the complete native bundle has been assembled.
  if (nativeMac) {
    // Browser-downloaded source archives may carry Finder/provenance metadata.
    // Such extended attributes are not app resources and codesign rejects them.
    await run('xattr', ['-cr', app]);
    await run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', '--entitlements', path.resolve('desktop/entitlements.mac.plist'), app]);
    await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  }
  const zip = path.join(installers, `${stem}-${nativeMac ? 'adhoc' : 'unsigned'}.zip`);
  if (nativeMac) await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
  else await run('zip', ['-qry', zip, path.basename(app)], {cwd: appDir});
  if (dmg) {
    const dmgRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-math-dmg-'));
    try {
      await run('ditto', [app, path.join(dmgRoot, `${pkg.productName}.app`)]);
      await fs.symlink('/Applications', path.join(dmgRoot, 'Applications'));
      await run('hdiutil', ['create', '-volname', pkg.productName, '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', path.join(installers, `${stem}-adhoc.dmg`)]);
    } finally { await fs.rm(dmgRoot, {recursive: true, force: true}); }
  }
}
const artifacts = (await fs.readdir(installers)).filter(name => /\.(exe|zip|dmg)$/.test(name));
if (nativeMac && dmg) {
  const image = path.join(installers, artifacts.find(name => name.endsWith('.dmg')) || 'missing.dmg');
  const mount = await fs.mkdtemp(path.resolve('.local', 'verify-dmg-'));
  try {
    await run('hdiutil', ['attach', '-readonly', '-nobrowse', '-noverify', '-mountpoint', mount, image]);
    const mountedApp = path.join(mount, `${pkg.productName}.app`);
    await fs.access(path.join(mountedApp, 'Contents/Info.plist'));
    await fs.access(path.join(mountedApp, `${pkg.productName}.app`)).then(() => { throw Error('DMG contains a nested app bundle.'); }, error => { if (error.code !== 'ENOENT') throw error; });
    await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', mountedApp]);
  } finally {
    await run('hdiutil', ['detach', mount]).catch(() => {});
    await fs.rm(mount, {recursive: true, force: true});
  }
}
let sums = '';
for (const name of artifacts) sums += `${sha256(await fs.readFile(path.join(installers, name)))}  ${name}\n`;
await fs.writeFile(path.join(installers, 'SHA256SUMS'), sums);
const report = {version: pkg.version, target: target.name, buildHost: `${process.platform}-${process.arch}`, appDir, artifacts, tool, sourceFiles, distribution: 'public-beta', publishing: false, nativeLaunchTested: false, signing: nativeMac ? 'ad-hoc; resource seal verified; not notarized' : 'unsigned; native signing required', builtAt: new Date().toISOString()};
await fs.writeFile(path.join(installers, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(installers, 'START-HERE.txt'), `Axiovela Math ${pkg.version} — public beta\nTarget: ${target.name}\n\n${target.platform === 'win32' ? 'Run the unsigned EXE for a per-user install, or extract the ZIP and run axiovela-math.exe. Windows may warn about the unrecognized publisher.' : nativeMac ? 'Drag Axiovela Math to Applications. This app is locally ad-hoc signed and resource-seal verified, but it is not Developer ID signed or notarized.' : 'This ZIP contains a cross-built app bundle, not a finished Mac installer. On a Mac, rebuild with npm run desktop:package:mac -- --dmg to sign locally and create a DMG. Do not bypass Gatekeeper to test this unsigned archive.'}\n\nNode.js and Tectonic are bundled. First LaTeX rendering needs internet for TeX resources. Lean setup is automatic on Linux and macOS; it installs Elan per user, preserves project pins, and validates the compiler and imports. Provider CLIs are installed separately.\n\nProjects and credentials stay outside the app. Do not delete the application-data folder during an upgrade. Obtain releases from https://github.com/CashBowman/axiovela-math/releases. No GitHub credentials are embedded.\n`);
await fs.mkdir(path.dirname(destination), {recursive: true});
await fs.rm(destination, {recursive: true, force: true});
await fs.rename(installers, destination);
console.log(`Local ${target.name} artifacts: ${destination}`);
