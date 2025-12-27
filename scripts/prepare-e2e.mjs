import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const source = path.join(distDir, 'manifest.e2e.json');
const target = path.join(distDir, 'manifest.json');

if (!existsSync(source)) {
  throw new Error('Missing dist/manifest.e2e.json. Run npm run build first.');
}

copyFileSync(source, target);
console.log('Prepared dist/manifest.json for E2E.');
