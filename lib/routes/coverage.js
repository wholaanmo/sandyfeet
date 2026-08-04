/**
 * Route Coverage Validation — build-time discovery check.
 *
 * Scans the app directory for page.js and route.js files, compares them
 * against the canonical manifest, and fails if any discrepancies are found:
 *  - Missing baseline routes (in manifest but not on filesystem)
 *  - Unclassified discovered routes (on filesystem but not in manifest)
 *  - Duplicate IDs or patterns in the manifest
 *  - Redirect cycles
 *  - Dead redirect destinations (redirectTo targets that don't exist)
 *
 * Run via: node lib/routes/coverage.js
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { ROUTE_MANIFEST } from './manifest.js';

/**
 * Recursively find all page.js and route.js files under a directory.
 */
async function discoverRouteFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs, node_modules, and non-route dirs
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      files.push(...(await discoverRouteFiles(fullPath)));
    } else if (entry.name === 'page.js' || entry.name === 'route.js') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Convert a filesystem path to a Next.js route pattern.
 * e.g., app/rooms/[slug]/page.js -> /rooms/[slug]
 *       app/page.js -> /
 */
function fileToPattern(filePath, appDir) {
  const rel = relative(appDir, filePath).split(sep).join('/');
  // Remove the filename (page.js or route.js)
  // Handles both 'page.js' (root) and 'subdir/page.js'
  const withoutFile = rel.replace(/^(page|route)\.js$/, '').replace(/\/(page|route)\.js$/, '');
  // Root page is just '/'
  const pattern = withoutFile === '' ? '/' : `/${withoutFile}`;
  return pattern;
}

/**
 * Determine the route kind based on filename.
 */
function fileToKind(filePath) {
  return filePath.endsWith('route.js') ? 'api' : 'page';
}

/**
 * Run the full coverage validation.
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ errors: string[], warnings: string[] }}
 */
export async function validateCoverage(projectRoot) {
  const appDir = join(projectRoot, 'app');
  const errors = [];
  const warnings = [];

  // 1. Check for duplicate IDs
  const idCounts = new Map();
  for (const route of ROUTE_MANIFEST) {
    idCounts.set(route.id, (idCounts.get(route.id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push(`Duplicate route ID: "${id}" appears ${count} times`);
    }
  }

  // 2. Check for duplicate patterns (same pattern + kind)
  const patternKeys = new Map();
  for (const route of ROUTE_MANIFEST) {
    const key = `${route.kind}:${route.pattern}`;
    if (patternKeys.has(key)) {
      errors.push(
        `Duplicate pattern: "${route.pattern}" (${route.kind}) used by both "${patternKeys.get(key)}" and "${route.id}"`
      );
    }
    patternKeys.set(key, route.id);
  }

  // 3. Check redirect cycles and dead destinations
  const activePatterns = new Set(
    ROUTE_MANIFEST.filter((r) => r.status === 'active').map((r) => r.pattern)
  );

  for (const route of ROUTE_MANIFEST) {
    if (route.status === 'legacy-redirect') {
      if (!route.redirectTo) {
        errors.push(`Legacy redirect "${route.id}" has no redirectTo target`);
        continue;
      }

      // Check for self-redirect
      if (route.redirectTo === route.pattern) {
        errors.push(`Redirect cycle: "${route.id}" redirects to itself`);
        continue;
      }

      // Check if destination exists (accounting for dynamic segments)
      const destinationExists = ROUTE_MANIFEST.some(
        (r) => r.pattern === route.redirectTo && r.status === 'active'
      );
      if (!destinationExists) {
        errors.push(
          `Dead redirect destination: "${route.id}" -> "${route.redirectTo}" (no active route)`
        );
      }

      // Check for redirect chains
      const chainTarget = ROUTE_MANIFEST.find(
        (r) => r.pattern === route.redirectTo && r.status === 'legacy-redirect'
      );
      if (chainTarget) {
        errors.push(
          `Redirect chain: "${route.id}" -> "${route.redirectTo}" which is also a redirect`
        );
      }
    }
  }

  // 4. Discover filesystem routes
  let discoveredFiles;
  try {
    await stat(appDir);
    discoveredFiles = await discoverRouteFiles(appDir);
  } catch {
    warnings.push(`Could not scan app directory at ${appDir}`);
    return { errors, warnings };
  }

  const discoveredPatterns = new Map();
  for (const file of discoveredFiles) {
    const pattern = fileToPattern(file, appDir);
    const kind = fileToKind(file);
    discoveredPatterns.set(`${kind}:${pattern}`, { pattern, kind, file });
  }

  // 5. Check for manifest routes missing from filesystem (excluding legacy-redirects)
  for (const route of ROUTE_MANIFEST) {
    if (route.status === 'legacy-redirect') continue;
    const key = `${route.kind}:${route.pattern}`;
    if (!discoveredPatterns.has(key)) {
      errors.push(
        `Missing baseline route: "${route.id}" (${route.pattern}) not found on filesystem`
      );
    }
  }

  // 6. Check for filesystem routes not in manifest
  for (const [key, { pattern, kind }] of discoveredPatterns) {
    const inManifest = ROUTE_MANIFEST.some(
      (r) => r.kind === kind && r.pattern === pattern
    );
    if (!inManifest) {
      errors.push(
        `Unclassified route: ${kind} at "${pattern}" exists on filesystem but not in manifest`
      );
    }
  }

  return { errors, warnings };
}

/**
 * CLI entry point — run coverage validation and exit with non-zero on errors.
 */
async function main() {
  const projectRoot = process.cwd();
  console.log('Route coverage validation...\n');

  const { errors, warnings } = await validateCoverage(projectRoot);

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log('ERRORS (build will fail):');
    for (const e of errors) {
      console.log(`  ✗ ${e}`);
    }
    console.log(`\n${errors.length} error(s) found.`);
    process.exit(1);
  }

  console.log('✓ All routes classified and consistent.');
}

// Run as CLI if executed directly
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('coverage.js') ||
    process.argv[1].endsWith('coverage.mjs'));

if (isMainModule) {
  main().catch((err) => {
    console.error('Coverage validation crashed:', err.message);
    process.exit(1);
  });
}
