import fc from 'fast-check';

const seed = Number.parseInt(process.env.FC_SEED ?? '424242', 10);
const numRuns = Number.parseInt(process.env.FC_NUM_RUNS ?? '100', 10);
const path = process.env.FC_PATH;

fc.configureGlobal({
  seed,
  numRuns,
  path,
  endOnFailure: true,
  verbose: 2,
});

console.info(`[fast-check] seed=${seed} numRuns=${numRuns}${path ? ` path=${path}` : ''}`);
