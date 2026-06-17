import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function parseValue(raw) {
  const value = raw.trim();
  if (!value) return '';
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    const inner = value.slice(1, -1);
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner;
  }
  const hashIndex = value.search(/\s#/);
  return (hashIndex >= 0 ? value.slice(0, hashIndex) : value).trim();
}

function formatValue(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (text === '') return '';
  if (/^[A-Za-z0-9_./:@?=&,+-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

export function parseEnvContent(content) {
  const lines = content.split(/\r?\n/);
  const values = {};
  const entries = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return { type: 'raw', line };
    const [, key, rawValue] = match;
    values[key] = parseValue(rawValue);
    return { type: 'entry', key, line };
  });
  return { entries, values };
}

export async function readEnvFile(envFile) {
  try {
    const content = await readFile(envFile, 'utf8');
    return parseEnvContent(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { entries: [], values: {} };
  }
}

export async function readEnvValues(envFile) {
  const parsed = await readEnvFile(envFile);
  return parsed.values;
}

export async function writeEnvValues(envFile, updates) {
  const parsed = await readEnvFile(envFile);
  const remaining = { ...updates };
  const lines = parsed.entries.map((entry) => {
    if (entry.type !== 'entry' || !(entry.key in remaining)) return entry.line;
    const value = remaining[entry.key];
    delete remaining[entry.key];
    return `${entry.key}=${formatValue(value)}`;
  });

  for (const [key, value] of Object.entries(remaining)) {
    lines.push(`${key}=${formatValue(value)}`);
  }

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  await mkdir(dirname(envFile), { recursive: true });
  await writeFile(envFile, `${lines.join('\n')}\n`, { mode: 0o600 });
}

