import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const seed = process.env.FC_SEED ?? '424242';
const resultsDir = path.resolve('.test-results/property');
const userArgs = process.argv.slice(2).filter((argument) => argument !== '--run');
const args = [path.resolve('node_modules/vitest/vitest.mjs'), '--config', 'vitest.property.config.js', '--run', '--passWithNoTests', ...userArgs];
let output = `[fast-check] seed=${seed}\n`;

await mkdir(resultsDir, { recursive: true });
const child = spawn(process.execPath, args, {
  env: { ...process.env, FC_SEED: seed, NODE_ENV: 'test', TEST_SUITE: 'property' },
  stdio: ['inherit', 'pipe', 'pipe'],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output += chunk;
    (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
  });
}

const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? 1));
});

await writeFile(path.join(resultsDir, 'latest.log'), output);
if (exitCode !== 0) {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const failureLog = `${stamp}-seed-${seed}.log`;
  await writeFile(path.join(resultsDir, failureLog), output);
  await writeFile(path.join(resultsDir, 'latest-failure.json'), `${JSON.stringify({ seed: Number(seed), log: failureLog, replay: `FC_SEED=${seed} npm run test:property`, recordedAt: new Date().toISOString() }, null, 2)}\n`);
}

process.exitCode = exitCode;
