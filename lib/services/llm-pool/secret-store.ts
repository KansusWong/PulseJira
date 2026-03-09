import fs from 'fs';
import path from 'path';

const API_KEY_ENV_REF_PREFIX = 'env:';
const ACCOUNT_KEY_ENV_PREFIX = 'LLM_POOL_ACCOUNT_KEY_';
const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

export function parseApiKeyEnvRef(value: string | undefined | null): string | null {
  const raw = String(value || '').trim();
  if (!raw.toLowerCase().startsWith(API_KEY_ENV_REF_PREFIX)) return null;
  const envName = raw.slice(API_KEY_ENV_REF_PREFIX.length).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(envName)) return null;
  return envName;
}

export function buildApiKeyEnvRef(envName: string): string {
  return `${API_KEY_ENV_REF_PREFIX}${envName}`;
}

export function resolveApiKey(value: string | undefined | null): string {
  const envName = parseApiKeyEnvRef(value);
  if (envName) {
    const inProcess = String(process.env[envName] || '').trim();
    if (inProcess) return inProcess;

    const fromFile = readEnvLocalValue(envName);
    if (fromFile) {
      process.env[envName] = fromFile;
      return fromFile;
    }
    return '';
  }
  return String(value || '').trim();
}

function sanitizeAccountId(accountId: string): string {
  const normalized = String(accountId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'ACCOUNT';
}

export function getAccountApiKeyEnvName(accountId: string): string {
  return `${ACCOUNT_KEY_ENV_PREFIX}${sanitizeAccountId(accountId)}`;
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteEnvValue(value: string): string {
  return `"${String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')}"`;
}

export function upsertEnvLocalSecret(envName: string, value: string): void {
  const nextLine = `${envName}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^\\s*${escapeRegExp(envName)}\\s*=`);

  let lines: string[] = [];
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf-8').split(/\r?\n/);
  }

  let replaced = false;
  lines = lines.map((line) => {
    if (!pattern.test(line)) return line;
    replaced = true;
    return nextLine;
  });

  if (!replaced) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(nextLine);
  }

  fs.writeFileSync(ENV_LOCAL_PATH, lines.join('\n'), 'utf-8');
  process.env[envName] = value;
}

function readEnvLocalValue(envName: string): string {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return '';
  const pattern = new RegExp(`^\\s*${escapeRegExp(envName)}\\s*=\\s*(.*)$`);
  const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    return parseEnvAssignmentValue(match[1]);
  }
  return '';
}

function parseEnvAssignmentValue(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1);
  }
  return text;
}
