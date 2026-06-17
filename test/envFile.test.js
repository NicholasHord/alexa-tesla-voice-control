import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnvContent, writeEnvValues } from '../src/envFile.js';

test('parses simple dotenv content', () => {
  const parsed = parseEnvContent('A=one\nB="two words"\n# comment\nC=value # comment\n');
  assert.equal(parsed.values.A, 'one');
  assert.equal(parsed.values.B, 'two words');
  assert.equal(parsed.values.C, 'value');
});

test('writes updates while preserving comments', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alexa-tesla-env-'));
  const file = join(dir, '.env');
  try {
    await writeEnvValues(file, { A: 'one', B: 'two words' });
    await writeEnvValues(file, { A: 'updated', C: 'https://example.com/path?x=1' });
    const body = await readFile(file, 'utf8');
    assert.match(body, /^A=updated/m);
    assert.match(body, /^B="two words"/m);
    assert.match(body, /^C=https:\/\/example.com\/path\?x=1/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

