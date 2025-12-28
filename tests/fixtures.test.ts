import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const samplesRoot = path.resolve(__dirname, '..', 'docs', 'samples');
const MAX_BYTES = 50 * 1024;
const DISALLOWED_PATTERNS = [/<script/i, /<style/i, /<link/i, /<meta(?!\s+charset=)/i, /amazon-adsystem/i];

const collectHtmlFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive') {
        continue;
      }
      results.push(...collectHtmlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
};

describe('HTML fixtures', () => {
  it('are sanitized and lightweight', () => {
    const files = collectHtmlFiles(samplesRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const stats = fs.statSync(file);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.size).toBeLessThan(MAX_BYTES);
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of DISALLOWED_PATTERNS) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });
});
