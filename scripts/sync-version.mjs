#!/usr/bin/env node

/**
 * Syncs the version from package.json to manifest.json
 * Run automatically via npm postversion hook
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const version = packageJson.version;

// Update public/manifest.json
const manifestPath = resolve(root, 'public/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Update public/manifest.e2e.json if it exists
const manifestE2ePath = resolve(root, 'public/manifest.e2e.json');
try {
  const manifestE2e = JSON.parse(readFileSync(manifestE2ePath, 'utf-8'));
  manifestE2e.version = version;
  writeFileSync(manifestE2ePath, JSON.stringify(manifestE2e, null, 2) + '\n');
} catch {
  // manifest.e2e.json may not exist, that's fine
}

console.log(`✓ Synced version ${version} to manifest files`);
