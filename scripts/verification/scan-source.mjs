import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TARGETS = ['app', 'components', 'lib', 'middleware.js', 'next.config.mjs'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['service-account private key', /["']private_key["']\s*:\s*["'][^"']{20,}/gi],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['Stripe live secret', /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ['provider secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['literal bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/g],
];

async function sourceFiles(target) {
  const absolute = path.resolve(ROOT, target);
  let metadata;
  try { metadata = await stat(absolute); } catch { return []; }
  if (metadata.isFile()) return SOURCE_EXTENSIONS.has(path.extname(absolute)) ? [absolute] : [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => !entry.name.startsWith('.')).map((entry) => sourceFiles(path.join(target, entry.name))));
  return nested.flat();
}

export function findSensitiveTokens(content) {
  return SECRET_PATTERNS.flatMap(([label, pattern]) => [...content.matchAll(pattern)].map((match) => ({
    label,
    index: match.index ?? 0,
  })));
}

export function findForbiddenServerImports(file, content, root = ROOT) {
  const isBoundary = file.includes(`${path.sep}components${path.sep}`) || /^\s*['"]use client['"];?/m.test(content);
  if (!isBoundary) return [];
  const imports = [...content.matchAll(/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]);
  return imports.filter((specifier) => {
    if (specifier === '@/lib/server' || specifier.startsWith('@/lib/server/')) return true;
    if (!specifier.startsWith('.')) return false;
    const resolved = path.resolve(path.dirname(file), specifier);
    const serverRoot = path.resolve(root, 'lib/server');
    return resolved === serverRoot || resolved.startsWith(`${serverRoot}${path.sep}`);
  });
}
async function run(mode) {
  if (!['server-imports', 'sensitive-tokens'].includes(mode)) {
    throw new Error('Usage: scan-source.mjs <server-imports|sensitive-tokens>');
  }
  const files = (await Promise.all(TARGETS.map(sourceFiles))).flat();
  const findings = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const matches = mode === 'server-imports'
      ? findForbiddenServerImports(file, content).map((specifier) => ({ label: 'server import', specifier }))
      : findSensitiveTokens(content);
    for (const match of matches) findings.push({ file: path.relative(ROOT, file), ...match });
  }
  if (findings.length > 0) {
    for (const finding of findings) {
      const location = Number.isInteger(finding.index) ? ` at byte ${finding.index}` : '';
      const detail = finding.specifier ? ` (${finding.specifier})` : '';
      console.error(`${finding.file}${location}: forbidden ${finding.label}${detail}`);
    }
    process.exitCode = 1;
    return;
  }
  console.info(`Scanned ${files.length} source files: no forbidden ${mode} found.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
