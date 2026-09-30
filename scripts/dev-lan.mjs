import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const addresses = Object.values(networkInterfaces()).flat().filter(a => a && !a.internal && a.family === 'IPv4').map(a => a.address);
const origins = ['http://localhost:3000', 'http://127.0.0.1:3000', ...addresses.map(ip => `http://${ip}:3000`)];
console.log('\nLAN testing only. Keep both devices on the same trusted network.');
console.log('Open one of these addresses on your phone:');
for (const address of addresses) console.log(`  http://${address}:3000`);
if (!addresses.length) console.log('No LAN IPv4 address detected. Connect to Wi-Fi or Ethernet first.');
console.log('Allow ports 3000 and 2567 on Windows Private networks if prompted. Ctrl+C stops both services.\n');
const children = [
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts', '--host', '0.0.0.0', '--strictPort'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    stdio: 'inherit', env: { ...process.env, HOST: '0.0.0.0', PORT: '2567', ALLOWED_ORIGINS: origins.join(',') },
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', err => { console.error(err.message); stop(1); });
  child.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
