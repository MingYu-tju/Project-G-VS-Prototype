import { createBattleServer } from './server.js';

const port = Number(process.env.PORT ?? 2567);
const maxRooms = Number(process.env.MAX_ROOMS ?? 80);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(maxRooms) || maxRooms < 1) {
  throw new Error('PORT and MAX_ROOMS must be valid positive integers.');
}
const server = createBattleServer({
  port, maxRooms, host: process.env.HOST ?? '127.0.0.1',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim()).filter(Boolean),
});
server.listen().then(p => console.log(`G-VS server listening on ${process.env.HOST ?? '127.0.0.1'}:${p}`)).catch(err => {
  console.error(err); process.exitCode = 1; void server.close();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().then(() => process.exit(0)); });
