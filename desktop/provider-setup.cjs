// Fixed, reviewed setup actions only. No renderer-supplied commands or arguments.
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {spawn} = require('node:child_process');
const packages = {codex: '@openai/codex', claude: '@anthropic-ai/claude-code', gemini: '@google/gemini-cli', opencode: 'opencode-ai', pi: '--ignore-scripts @earendil-works/pi-coding-agent@0.85.1'};
function setupCommand(id, action, platform = process.platform) {
  if(id==='lean'){
    if(action!=='install'||platform!=='linux')throw new Error('Lean setup currently supports Linux installation.');
    return leanSetupCommand();
  }
  if (!Object.hasOwn(packages, id) && id !== 'herdr') throw new Error('Unknown setup tool.');
  if (!['install', 'login', 'integration'].includes(action)) throw new Error('Unknown setup action.');
  const windows = platform === 'win32';
  if (action === 'integration') { if (id !== 'herdr') throw new Error('Integration is only available for Herdr.'); return 'herdr integration install pi'; }
  if (action === 'login') {
    if (id === 'herdr') throw new Error('Herdr does not have a provider login.');
    return id === 'opencode' ? `${windows ? 'opencode.cmd' : 'opencode'} auth login` : `${id}${windows && ['pi', 'gemini'].includes(id) ? '.cmd' : ''}`;
  }
  if (id === 'herdr') return windows ? 'irm https://herdr.dev/install.ps1 | iex' : 'curl -fsSL https://herdr.dev/install.sh | sh';
  return `${windows ? 'npm.cmd' : 'npm'} install -g ${packages[id]}`;
}
const shellQuote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
function leanSetupCommand(directory, statusDirectory) {
  return ['bash', shellQuote(path.join(__dirname, 'lean-setup.sh')), ...(directory ? [shellQuote(directory), shellQuote(statusDirectory)] : [])].join(' ');
}
async function launchSetup(id, action, options = {}) {
  return launchTerminal(setupCommand(id, action), `${id} ${action}`, options);
}
async function launchTerminal(command, label, {env = process.env} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-setup-'));
  const file = path.join(directory, process.platform === 'win32' ? 'setup.ps1' : 'setup.sh');
  const script = process.platform === 'win32' ? `$ErrorActionPreference = 'Stop'\nWrite-Host 'Axiovela: ${label}'\n${command}\n` : `#!/bin/bash\nset -o pipefail\nprintf '%s\\n' 'Axiovela: ${label}'\n${command}\nresult=$?\nprintf '\\nCommand exited with status %s. Return to Axiovela. Lean setup status updates automatically; provider connections can be refreshed.\\n' "$result"\nread -r -p 'Press Enter to close…'\n`;
  await fs.writeFile(file, script, {mode: 0o700});
  const launch = (executable, args) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, {env, detached: true, stdio: 'ignore'});
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
  if (process.platform === 'win32') await launch('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', file]);
  else if (process.platform === 'darwin') await launch('osascript', ['-e', 'on run argv\ntell application "Terminal"\nactivate\ndo script "bash " & quoted form of (item 1 of argv)\nend tell\nend run', file]);
  else {
    let opened = false;
    for (const [terminal, args] of [['x-terminal-emulator', ['-e', 'bash', file]], ['gnome-terminal', ['--', 'bash', file]], ['konsole', ['-e', 'bash', file]], ['xterm', ['-e', 'bash', file]]]) {
      try { await launch(terminal, args); opened = true; break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!opened) throw new Error('No supported terminal found. Use the copyable setup commands below.');
  }
  return {message: 'Setup opened in your terminal. Complete the prompts, then refresh connections in Axiovela.'};
}
module.exports = {setupCommand, launchSetup, leanSetupCommand, launchTerminal};
