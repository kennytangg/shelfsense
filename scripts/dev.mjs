import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = resolve(root, '.venv/bin/python');
const statePath = resolve(root, '.shelfsense-dev.json');

export const postgres = Object.freeze({
  container: 'shelfsense-postgres',
  image: 'postgres:16-alpine',
  port: 5433,
  volume: 'shelfsense_pg',
});

export function updateDatabaseUrl(contents, url) {
  const line = `DATABASE_URL=${url}`;
  return /^DATABASE_URL=.*$/m.test(contents)
    ? contents.replace(/^DATABASE_URL=.*$/m, line)
    : `${contents.trimEnd()}\n${line}\n`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed. Check the output above.`);
  return result.stdout?.trim();
}

async function availablePort(start) {
  for (let port = start; port < start + 20; port++) {
    const free = await new Promise((done) => {
      const server = createServer();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') done(false);
        else throw error;
      });
      server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error(`No available port near ${start}.`);
}

async function main() {
  const container = postgres.container;
  const existing = run('docker', ['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (existing) run('docker', ['start', container]);
  else run('docker', ['run', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`, '-p', `127.0.0.1:${postgres.port}:5432`, '-v', `${postgres.volume}:/var/lib/postgresql/data`, postgres.image]);
  console.log(`Using PostgreSQL container: ${container}`);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready'], { stdio: 'ignore' }).status === 0) {
      ready = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw new Error('PostgreSQL did not become ready within 30 seconds.');

  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { password: randomBytes(24).toString('hex') };
  // Save before provisioning so an interrupted first run retains its credentials.
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  const sql = `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shelfsense_prototype') THEN
      CREATE ROLE shelfsense_prototype LOGIN PASSWORD '${state.password}';
    END IF;
  END $$;
  SELECT 'CREATE DATABASE shelfsense_prototype OWNER shelfsense_prototype'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'shelfsense_prototype')
  \\gexec
  `;
  run('docker', ['exec', '-i', container, 'sh', '-c', 'exec psql -U "${POSTGRES_USER:-postgres}" -d postgres -v ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
  const url = `postgresql+psycopg://shelfsense_prototype:${state.password}@127.0.0.1:${postgres.port}/shelfsense_prototype`;
  const envPath = resolve(root, 'backend/.env');
  writeFileSync(envPath, updateDatabaseUrl(existsSync(envPath) ? readFileSync(envPath, 'utf8') : '', url), { mode: 0o600 });
  const env = { ...process.env, DATABASE_URL: url };

  if (!existsSync(python)) run('python3.12', ['-m', 'venv', '.venv']);
  const installed = spawnSync(python, ['-c', 'import shelfsense, uvicorn, alembic, psycopg, cv2'], { cwd: root, stdio: 'ignore' });
  if (installed.status !== 0) {
    run(python, ['-m', 'pip', 'install', '-r', 'backend/requirements.lock']);
    run(python, ['-m', 'pip', 'install', '--no-deps', '-e', 'backend']);
  }
  if (!existsSync(resolve(root, 'frontend/node_modules/.bin/next'))) run('npm', ['ci', '--prefix', 'frontend']);
  run(python, ['-m', 'alembic', '-c', 'backend/alembic.ini', 'upgrade', 'head'], { env });
  run(resolve(root, '.venv/bin/shelfsense'), ['seed'], { env });

  const backendPort = await availablePort(8000);
  const frontendPort = await availablePort(3000);
  const children = [
    spawn(python, ['-m', 'uvicorn', 'shelfsense.api:app', '--host', '127.0.0.1', '--port', String(backendPort), '--reload'], { cwd: root, env, stdio: 'inherit', detached: true }),
    spawn('npm', ['run', 'dev', '--', '--port', String(frontendPort)], { cwd: resolve(root, 'frontend'), env: { ...env, NEXT_DIST_DIR: '.next-prototype', BACKEND_URL: `http://127.0.0.1:${backendPort}` }, stdio: 'inherit', detached: true }),
  ];
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
      }
    }
    process.exitCode = code;
    const timer = setTimeout(() => {
      for (const child of children) {
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      }
    }, 5000);
    timer.unref();
  }
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  for (const child of children) {
    child.on('error', (error) => { console.error(error.message); stop(1); });
    child.on('exit', (code) => stop(code ?? 1));
  }
  console.log(`\nShelfSense: http://127.0.0.1:${frontendPort} — API: http://127.0.0.1:${backendPort}/docs\nCtrl+C stops both apps. PostgreSQL keeps running.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`\nStartup failed: ${error.message}`); process.exitCode = 1; });
}
