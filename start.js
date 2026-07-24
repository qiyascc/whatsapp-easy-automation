import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map((part) => Number.parseInt(part, 10));
const supportsBuiltInSqlite = major > 22 || (major === 22 && minor >= 5);

const args = [];
if (supportsBuiltInSqlite) args.push('--experimental-sqlite');
args.push(fileURLToPath(new URL('./src/main.js', import.meta.url)));

const child = spawn(process.execPath, args, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
