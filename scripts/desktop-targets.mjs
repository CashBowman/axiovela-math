// Tectonic pins follow Axiovela's MIT-licensed desktop-tools.mjs.
export const targets = Object.freeze({
  'win32-x64': {platform: 'win32', arch: 'x64', suffix: 'x86_64-pc-windows-msvc.zip', sha256: 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'},
  'darwin-arm64': {platform: 'darwin', arch: 'arm64', suffix: 'aarch64-apple-darwin.tar.gz', sha256: 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'},
  'darwin-x64': {platform: 'darwin', arch: 'x64', suffix: 'x86_64-apple-darwin.tar.gz', sha256: '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'},
});
export function desktopTarget(name) {
  if (!Object.hasOwn(targets, name)) throw Error(`Unsupported target: ${name}. Choose ${Object.keys(targets).join(', ')}.`);
  return {...targets[name], name, binary: targets[name].platform === 'win32' ? 'tectonic.exe' : 'tectonic', url: `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-${targets[name].suffix}`};
}

// Package reviewed runtime files only. Tools and icon containers are supplied
// separately for each target; no working-tree data, credentials or docs enter.
export function runtimeFile(file) {
  if (file.split('/').some(p => p.startsWith('.') || p === 'node_modules')) return false;
  if (file === 'LICENSE' || file === 'public/workbench-mark.png') return true;
  if (/^server\/axiovela\/research-skills\/(math-statistics|data-science|biology)\/SKILL\.md$/.test(file)) return true;
  if (/^(server|shared)\/.*\.(mjs|cjs|json)$/.test(file)) return true;
  return /^desktop\/(?:[^/]+\.(cjs|json|sh)|licenses\/[^/]+\.txt)$/.test(file);
}
