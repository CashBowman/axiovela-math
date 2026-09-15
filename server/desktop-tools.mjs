import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function bundledTectonic({platform = process.platform, arch = process.arch, directory = fileURLToPath(new URL('../desktop/tools/', import.meta.url))} = {}) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'build.json'), 'utf8'));
    const binary = path.join(directory, platform === 'win32' ? 'tectonic.exe' : 'tectonic');
    return manifest.target === `${platform}-${arch}` && fs.existsSync(binary) ? binary : null;
  } catch { return null; }
}
