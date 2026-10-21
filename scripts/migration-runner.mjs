#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const RUNNER_SCHEMA_VERSION = 1;
export const MANAGED_VERSION_FLOOR = 127;
export const ADVISORY_LOCK_KEYS = Object.freeze([1363234097, 1835627122]);
export const LOCK_TIMEOUT_MS = 10_000;
export const QUERY_TIMEOUT_MS = 30_000;
export const CONNECTION_TIMEOUT_MS = 10_000;
export const CONNECT_PHASES = Object.freeze({
  CREATED: 'client-created',
  STARTED: 'connect-started',
  CONNECTED: 'connected',
  ENDED: 'ended',
  END_FAILED: 'end-failed',
});
export const LEGACY_BASELINE = Object.freeze({
  migrationKey: '125_report_module_p2p3_fixes',
  fileName: '125_report_module_p2p3_fixes.sql',
  status: 'success',
  executor: 'migration-125-self',
});
export const MIGRATIONS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'database',
  'migrations'
);
export const BOOTSTRAP_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'database',
  'migration-runner',
  'bootstrap.sql'
);

const FORWARD_PATTERN = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const ROLLBACK_PATTERN = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.rollback\.sql$/;
const LEGACY_NON_NUMERIC_FILES = new Set([
  'ALTER_TABLE_FIX.sql',
  'CHECK_DATABASE_CONFIG.sql',
  'CHECK_DUPLICATE_SETTINGS_TABLE.sql',
  'CHECK_TABLE_STRUCTURE.sql',
  'COMPLETE_INIT.sql',
  'CREATE_AND_TEST_DUPLICATE_SETTINGS.sql',
  'CREATE_DUPLICATE_SETTINGS_TABLE.sql',
  'DIAGNOSE_AND_FIX.sql',
  'FINAL_FIX.sql',
  'FIX_DUPLICATE_CONFIG.sql',
  'FIX_FIELD_COLUMN_NAME.sql',
  'FIX_IMPORT_LOGS_VIEW.sql',
  'FORCE_REBUILD.sql',
  'PURE_SQL_FIX.sql',
  'QUICK_FIX.sql',
  'REBUILD_PRODUCT_FIELD_CONFIGS.sql',
  'SIMPLE_TEST.sql',
  'run_017_018.sql',
]);

export class RunnerError extends Error {
  constructor(code, message = code, options = {}) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
    this.cause = options.cause;
    this.secondaryDetails = [];
  }
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

const REDACTED = '[REDACTED]';

export function redactSecrets(value, secrets = []) {
  let output = String(value ?? '');
  // Longest fragments must be replaced first so an overlapping secret cannot
  // leak its suffix (e.g. 'alice' must not be replaced first inside
  // 'aliceSUPERSECRET'). Duplicates are collapsed first.
  const ordered = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const secret of ordered) {
    output = output.split(secret).join(REDACTED);
  }
  return output
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/([a-z0-9_]*(?:password|passwd|pwd|secret|token|host|hostaddr|user|username))(\s*[=:]\s*)([^\s&"'<>`]+)/gi, '$1$2[REDACTED]')
    .replace(/(authorization\s*:\s*bearer\s+)([^\s,;]+)/gi, '$1[REDACTED]')
    // Any Bearer <non-whitespace-token> is masked with no minimum length so a
    // short token cannot leak.
    .replace(/\b(bearer)\s+([^\s,;]+)/gi, '$1 [REDACTED]')
    .replace(/((?:^|[?&;\s])(?:api[_-]?key|x-api-key)\s*=\s*)([^\s&"'<>`;]+)/gi, '$1[REDACTED]');
}

function decodeUrlComponentBestEffort(value) {
  if (!value) return { decoded: '', usable: true };
  try {
    return { decoded: decodeURIComponent(value), usable: true };
  } catch {
    // Malformed percent-encoding for one component must not abort collection
    // of the others. The raw value is kept so it is still masked.
    return { decoded: value, usable: false };
  }
}

function encodeUrlComponentBestEffort(value) {
  if (!value) return '';
  try {
    return encodeURIComponent(value);
  } catch {
    // Redaction must never throw: a component that cannot be re-encoded is
    // skipped while every other fragment is still collected.
    return '';
  }
}

// RUNNER-REDACTION-UNIX-SOCKET-URL-01: a legal PostgreSQL connection string can
// use an empty authority (the libpq Unix-socket form)
// `postgresql://user:password@/db?host=/tmp/socket`. The WHATWG URL parser
// rejects that string with ERR_INVALID_URL, so without a fallback the only
// collected fragment is the whole connection string and a userinfo fragment
// echoed on its own in an error message (for example the bare password) would
// not be redacted. The prefix is anchored, so this parser never inspects
// ordinary error text.
const BOUNDED_POSTGRES_URL_PREFIX = /^postgres(?:ql)?:\/\//i;
// Only a value with real address/path substance is collected: a punctuation-only
// host (for example "/", ":" or "::1") would turn redaction into a blanket
// replacement of ordinary text instead of masking one secret.
const MINIMUM_BOUNDED_HOST_LENGTH = 4;

function isCollectableBoundedHost(value) {
  return value.length >= MINIMUM_BOUNDED_HOST_LENGTH && /[A-Za-z0-9]/.test(value);
}

// Bounded, single-purpose parser for `<scheme>://<userinfo>@<rest>`. It never
// throws and never scans beyond the authority, and when no userinfo can be
// identified safely it fails closed by leaving the whole connection string as
// the only fragment.
function collectBoundedUserInfoSecrets(databaseUrl, fragments) {
  const prefixMatch = BOUNDED_POSTGRES_URL_PREFIX.exec(databaseUrl);
  if (!prefixMatch) return;
  const remainder = databaseUrl.slice(prefixMatch[0].length);
  // The userinfo/host separator must live inside the authority, which ends at
  // the first path/query/fragment delimiter.
  const authorityEnd = remainder.search(/[/?#]/);
  const authority = authorityEnd === -1 ? remainder : remainder.slice(0, authorityEnd);
  const atIndex = authority.lastIndexOf('@');
  if (atIndex > 0) {
    const userinfo = authority.slice(0, atIndex);
    const separatorIndex = userinfo.indexOf(':');
    const rawUsername = separatorIndex === -1 ? userinfo : userinfo.slice(0, separatorIndex);
    const rawPassword = separatorIndex === -1 ? '' : userinfo.slice(separatorIndex + 1);
    // Each component is decoded independently so a malformed percent-encoding
    // in one of them cannot stop the other from being collected.
    const usernameInfo = decodeUrlComponentBestEffort(rawUsername);
    const passwordInfo = decodeUrlComponentBestEffort(rawPassword);
    const username = usernameInfo.usable ? usernameInfo.decoded : '';
    const password = passwordInfo.usable ? passwordInfo.decoded : '';
    if (rawUsername || rawPassword) {
      fragments.push(`${rawUsername}${rawPassword ? `:${rawPassword}` : ''}@`);
    }
    if (username && password) fragments.push(`${username}:${password}@`);
    if (username) fragments.push(username);
    if (password) fragments.push(password);
    // The raw (still percent-encoded) user/password fragments are kept so a
    // malformed component that cannot be decoded is still masked when it
    // appears on its own instead of inside the full URL.
    if (rawUsername) fragments.push(rawUsername);
    if (rawPassword) fragments.push(rawPassword);
    // Percent-encoded variants of the decoded secrets cover the case where an
    // error message echoes the encoded form instead of the plaintext one.
    const encodedUsername = encodeUrlComponentBestEffort(username);
    const encodedPassword = encodeUrlComponentBestEffort(password);
    if (encodedUsername) fragments.push(encodedUsername);
    if (encodedPassword) fragments.push(encodedPassword);
    if (username) fragments.push(`${username}@`);
    const host = authority.slice(atIndex + 1);
    if (isCollectableBoundedHost(host)) fragments.push(host);
  }
  // Query-level host parameters (the Unix-socket directory or host address) are
  // part of the same sensitive connection material.
  for (const match of databaseUrl.matchAll(/[?&](?:host|hostaddr)=([^&#]*)/g)) {
    const rawHost = match[1];
    if (!rawHost) continue;
    if (isCollectableBoundedHost(rawHost)) fragments.push(rawHost);
    const hostInfo = decodeUrlComponentBestEffort(rawHost);
    if (hostInfo.usable && isCollectableBoundedHost(hostInfo.decoded)) {
      fragments.push(hostInfo.decoded);
    }
  }
}

export function collectSecretsFromUrl(databaseUrl) {
  const fragments = [];
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) return fragments;
  // The full connection string is always a fragment so a malformed URL that
  // cannot be parsed by WHATWG URL is still masked as a whole.
  fragments.push(databaseUrl);
  let url = null;
  try {
    url = new URL(databaseUrl);
  } catch {
    // The WHATWG parser failed (for example the legal empty-authority
    // Unix-socket form above). Recover the userinfo fragments with the bounded
    // fallback instead of returning the connection string as the only fragment.
    collectBoundedUserInfoSecrets(databaseUrl, fragments);
    return [...new Set(fragments.filter((value) => value && value.length > 0))];
  }
  const rawUsername = url.username || '';
  const rawPassword = url.password || '';
  const usernameInfo = decodeUrlComponentBestEffort(rawUsername);
  const passwordInfo = decodeUrlComponentBestEffort(rawPassword);
  const username = usernameInfo.usable ? usernameInfo.decoded : '';
  const password = passwordInfo.usable ? passwordInfo.decoded : '';
  const hostname = url.hostname || '';
  const port = url.port || '';

  if (rawUsername || rawPassword) {
    fragments.push(`${rawUsername}${rawPassword ? `:${rawPassword}` : ''}@${url.host}`);
  }
  if (username && password) fragments.push(`${username}:${password}@`);
  if (username) fragments.push(username);
  if (password) fragments.push(password);
  // The raw (still percent-encoded) user/password fragments are kept so a
  // malformed component that cannot be decoded is still masked when it appears
  // on its own instead of inside the full URL.
  if (rawUsername) fragments.push(rawUsername);
  if (rawPassword) fragments.push(rawPassword);
  // Percent-encoded variants of the decoded secrets cover the case where an
  // error message echoes the encoded form instead of the plaintext one.
  if (username) fragments.push(encodeURIComponent(username));
  if (password) fragments.push(encodeURIComponent(password));
  if (username) fragments.push(`${username}@`);
  if (hostname) fragments.push(hostname);
  if (hostname && port) fragments.push(`${hostname}:${port}`);
  return [...new Set(fragments.filter((value) => value && value.length > 0))];
}

const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
// A code is not trustworthy just because it passes the safe-character gate:
// secret-like values must never be echoed verbatim as the attacker-visible
// error code. Runner-internal codes (LEGACY_BASELINE_REQUIRED,
// COMMIT_OUTCOME_UNKNOWN, LOCAL_MIGRATION_GAP, INVALID_TARGET_VERSION, ...)
// contain none of these markers.
const DANGEROUS_ERROR_CODE_MARKERS = [
  'bearer', 'token', 'secret', 'password', 'passwd', 'pwd', 'apikey',
  'api_key', 'x-api-key', 'host', 'user', 'postgres://', 'postgresql://',
];

function isDangerousErrorCode(code) {
  const lower = String(code).toLowerCase();
  return DANGEROUS_ERROR_CODE_MARKERS.some((marker) => lower.includes(marker));
}

export function formatError(error, secrets = [], seen = new Set()) {
  if (error === null || error === undefined) return 'unknown-error';
  if (typeof error !== 'object') return redactSecrets(String(error), secrets);
  if (seen.has(error)) return '[circular-error]';
  seen.add(error);
  const parts = [];
  if (typeof error.code === 'string' && error.code !== '') {
    // error.code is an attacker-visible field on wrapped errors and must never
    // carry a connection string or secret. A safe character set alone is not
    // enough (e.g. "Bearer_SUPERSECRET_private-host" is alphanumeric): the
    // code is also redacted and checked for secret-like markers.
    const redactedCode = redactSecrets(error.code, secrets);
    const safeCode = !isDangerousErrorCode(redactedCode)
      && SAFE_ERROR_CODE_PATTERN.test(redactedCode)
      ? redactedCode
      : '[REDACTED]';
    parts.push(`code=${safeCode}`);
  }
  const rawMessage = typeof error.message === 'string' ? error.message : error.name ?? 'error';
  parts.push(`message=${redactSecrets(rawMessage, secrets)}`);
  if (error.cause !== undefined && error.cause !== null) {
    parts.push(`cause=${formatError(error.cause, secrets, seen)}`);
  }
  if (Array.isArray(error.errors)) {
    for (let index = 0; index < error.errors.length; index += 1) {
      parts.push(`errors[${index}]=${formatError(error.errors[index], secrets, seen)}`);
    }
  }
  if (Array.isArray(error.secondaryDetails)) {
    for (const detail of error.secondaryDetails) {
      parts.push(`secondary=${redactSecrets(detail, secrets)}`);
    }
  }
  // A final second pass over the whole assembled output is the safety net for
  // any secret that survived redaction of an individual field (for example an
  // overlapping fragment that only shows up once fields are joined).
  return redactSecrets(parts.join(' | '), secrets);
}

function asPrimaryError(error) {
  if (error instanceof Error) return error;
  return new RunnerError('RUNNER_ERROR', String(error));
}

function attachSecondary(primary, secondary, secrets = [], operation) {
  const target = asPrimaryError(primary);
  target.secondaryDetails ??= [];
  const prefix = operation === undefined ? '' : `[cleanup-${operation}] `;
  target.secondaryDetails.push(`${prefix}${formatError(secondary, secrets)}`);
  return target;
}

export function queryClient(client, text, values = []) {
  return client.query({ text, values, query_timeout: QUERY_TIMEOUT_MS });
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

export function topLevelSqlStatements(sql) {
  const statements = [];
  let tokens = [];
  let index = 0;
  let blockDepth = 0;

  const finishStatement = () => {
    if (tokens.length > 0) statements.push(tokens);
    tokens = [];
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (blockDepth > 0) {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (char === "'") {
      const escapeString = index > 0
        && (sql[index - 1] === 'E' || sql[index - 1] === 'e')
        && (index < 2 || !isIdentifierPart(sql[index - 2]));
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (escapeString && sql[index] === '\\') {
          index += 2;
        } else if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          closed = true;
          break;
        } else {
          index += 1;
        }
      }
      if (!closed) throw new RunnerError('INVALID_SQL_UNTERMINATED_SINGLE_QUOTE');
      continue;
    }
    if (char === '"') {
      index += 1;
      let identifier = '';
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          identifier += '"';
          index += 2;
        } else if (sql[index] === '"') {
          index += 1;
          closed = true;
          break;
        } else {
          identifier += sql[index];
          index += 1;
        }
      }
      if (!closed) throw new RunnerError('INVALID_SQL_UNTERMINATED_DOUBLE_QUOTE');
      tokens.push({ value: identifier.toUpperCase(), quoted: true });
      continue;
    }
    if (char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        const delimiter = match[0];
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end < 0) throw new RunnerError('INVALID_SQL_UNTERMINATED_DOLLAR_QUOTE');
        index = end + delimiter.length;
        continue;
      }
    }
    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < sql.length && isIdentifierPart(sql[index])) index += 1;
      tokens.push({ value: sql.slice(start, index).toUpperCase(), quoted: false });
      continue;
    }
    if (char === ';') {
      finishStatement();
      index += 1;
      continue;
    }
    index += 1;
  }

  if (blockDepth !== 0) throw new RunnerError('INVALID_SQL_UNTERMINATED_BLOCK_COMMENT');
  finishStatement();
  return statements;
}

export function topLevelSqlTokens(sql) {
  return topLevelSqlStatements(sql).flat().map((token) => token.value);
}

export function assertNoTopLevelTransactionControl(sql) {
  for (const statement of topLevelSqlStatements(sql)) {
    const first = statement[0];
    if (!first || first.quoted) continue;
    if (['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'ABORT'].includes(first.value)) {
      throw new RunnerError('TRANSACTION_CONTROL_FORBIDDEN', first.value);
    }
    if (first.value === 'START' && statement[1]?.value === 'TRANSACTION' && !statement[1].quoted) {
      throw new RunnerError('TRANSACTION_CONTROL_FORBIDDEN', 'START TRANSACTION');
    }
  }
}

const LEDGER_TABLE_TOKEN = 'MIGRATION_RECORDS';
// CREATE is included because CREATE TRIGGER / RULE / INDEX (and any other
// CREATE) that targets the ledger would alter ledger behaviour or structure.
// COPY is included because COPY public.migration_records ... FROM writes rows
// into the ledger. A verb only triggers when the same statement also names the
// ledger table; ordinary CREATE/COPY statements stay allowed.
const LEDGER_WRITE_VERBS = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'ALTER', 'DROP', 'CREATE', 'COPY']);
const ARBITRARY_SQL_EXECUTORS = new Set(['EXEC_SQL']);
const MAX_SCAN_DEPTH = 64;

function isDollarDelimiterStart(sql, index) {
  return /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.test(sql.slice(index, index + 64));
}

/**
 * Splits a SQL/PLpgSQL fragment into its top-level statements. This scanner is
 * deliberately separate from the transaction-control lexer: it keeps the raw
 * statement text and any top-level dollar-quoted regions so the ledger-write
 * guard can descend into executable bodies without ever interpreting PL/pgSQL
 * BEGIN/END blocks as transaction control.
 */
function lexExecutableStatements(sql) {
  const statements = [];
  let tokens = [];
  let regions = [];
  let rawStart = 0;
  let blockDepth = 0;
  let index = 0;

  const finishStatement = (endIndex) => {
    if (tokens.length > 0 || regions.length > 0) {
      statements.push({ raw: sql.slice(rawStart, endIndex), tokens, regions });
    }
    tokens = [];
    regions = [];
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (blockDepth > 0) {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (char === "'") {
      const escapeString = index > 0
        && (sql[index - 1] === 'E' || sql[index - 1] === 'e')
        && (index < 2 || !isIdentifierPart(sql[index - 2]));
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (escapeString && sql[index] === '\\') {
          index += 2;
        } else if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          closed = true;
          break;
        } else {
          index += 1;
        }
      }
      if (!closed) throw new RunnerError('INVALID_SQL_UNTERMINATED_SINGLE_QUOTE');
      continue;
    }
    if (char === '"') {
      index += 1;
      let identifier = '';
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          identifier += '"';
          index += 2;
        } else if (sql[index] === '"') {
          index += 1;
          closed = true;
          break;
        } else {
          identifier += sql[index];
          index += 1;
        }
      }
      if (!closed) throw new RunnerError('INVALID_SQL_UNTERMINATED_DOUBLE_QUOTE');
      tokens.push({ value: identifier.toUpperCase(), quoted: true });
      continue;
    }
    if (char === '$' && isDollarDelimiterStart(sql, index)) {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)[0];
      const end = sql.indexOf(delimiter, index + delimiter.length);
      if (end < 0) throw new RunnerError('INVALID_SQL_UNTERMINATED_DOLLAR_QUOTE');
      regions.push({ content: sql.slice(index + delimiter.length, end) });
      index = end + delimiter.length;
      continue;
    }
    if (isIdentifierStart(char)) {
      // PostgreSQL U&"..." identifiers decode \XXXX Unicode escapes into the
      // identifier (for example U&"migration_\0072ecords" is
      // migration_records, and U&"exec_\0073ql" is exec_sql). The guard cannot
      // normalise them without full Unicode/UESCAPE handling, so any such
      // lexical form on an executable statement is fail-closed.
      if ((char === 'U' || char === 'u') && next === '&' && sql[index + 2] === '"') {
        throw new RunnerError('MIGRATION_LEDGER_WRITE_UNDETERMINABLE', 'unicode-escaped-identifier');
      }
      const start = index;
      index += 1;
      while (index < sql.length && isIdentifierPart(sql[index])) index += 1;
      tokens.push({ value: sql.slice(start, index).toUpperCase(), quoted: false });
      continue;
    }
    if (char === ';') {
      finishStatement(index);
      index += 1;
      rawStart = index;
      continue;
    }
    index += 1;
  }

  if (blockDepth !== 0) throw new RunnerError('INVALID_SQL_UNTERMINATED_BLOCK_COMMENT');
  finishStatement(sql.length);
  return statements;
}

function statementBodyKind(tokens) {
  if (tokens.length === 0 || tokens[0].quoted) return null;
  if (tokens[0].value === 'DO') return 'do';
  if (tokens[0].value !== 'CREATE') return null;
  let offset = 1;
  if (tokens[offset]?.value === 'OR' && tokens[offset + 1]?.value === 'REPLACE') offset += 2;
  if (tokens[offset]?.value === 'TEMP' || tokens[offset]?.value === 'TEMPORARY') offset += 1;
  if (tokens[offset]?.value === 'FUNCTION' && !tokens[offset].quoted) return 'function';
  if (tokens[offset]?.value === 'PROCEDURE' && !tokens[offset].quoted) return 'procedure';
  return null;
}

function rejectHazardousStatement(statement) {
  const values = statement.tokens.map((token) => token.value);
  if (values.some((value) => ARBITRARY_SQL_EXECUTORS.has(value))) {
    throw new RunnerError('MIGRATION_LEDGER_WRITE_FORBIDDEN', 'arbitrary-sql-executor-is-fail-closed');
  }
  if (values.includes(LEDGER_TABLE_TOKEN)
      && statement.tokens.some((token) => !token.quoted && LEDGER_WRITE_VERBS.has(token.value))) {
    throw new RunnerError('MIGRATION_LEDGER_WRITE_FORBIDDEN');
  }
}

/**
 * Dynamic-EXECUTE payload classification. Only a payload that is a single
 * fully static string literal or dollar-quoted literal can be inspected. Any
 * other form (variable, concatenation, format(), chr(), a function call, an
 * unterminated literal) returns null and the caller fails closed with
 * MIGRATION_LEDGER_WRITE_UNDETERMINABLE. The guard never attempts to evaluate
 * PL/pgSQL expressions.
 */
function classifyExecutePayload(raw, startIndex) {
  let index = skipWhitespaceAndComments(raw, startIndex);
  let escapeLiteral = false;
  if ((raw[index] === 'E' || raw[index] === 'e') && raw[index + 1] === "'") {
    escapeLiteral = true;
    index += 1;
  }
  if (raw[index] === "'") {
    index += 1;
    let content = '';
    let closed = false;
    while (index < raw.length) {
      if (escapeLiteral && raw[index] === '\\') {
        // An E-string may encode any byte or verb (for example \x55 decodes to
        // 'U', turning a payload into 'UPDATE ...'). The guard never strips the
        // backslash and rescans: without a complete, strict PostgreSQL escape
        // decode the payload cannot be proven safe, so it fails closed.
        return null;
      } else if (raw[index] === "'" && raw[index + 1] === "'") {
        content += "'";
        index += 2;
      } else if (raw[index] === "'") {
        index += 1;
        closed = true;
        break;
      } else {
        content += raw[index];
        index += 1;
      }
    }
    if (!closed) return null;
    return { content, rest: index };
  }
  const dollar = raw.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  if (dollar) {
    const delimiter = dollar[0];
    const end = raw.indexOf(delimiter, index + delimiter.length);
    if (end < 0) return null;
    return { content: raw.slice(index + delimiter.length, end), rest: end + delimiter.length };
  }
  return null;
}

/**
 * After a static payload literal the only permitted trailing text is
 * whitespace/comments, the end of the statement, or an INTO/USING clause
 * (PL/pgSQL passes its arguments as values, not as SQL text). A trailing
 * concatenation (||), function call or any other expression is not static and
 * must fail closed.
 */
function executePayloadRestIsStaticTail(raw, restIndex) {
  const rest = skipWhitespaceAndComments(raw, restIndex);
  if (rest >= raw.length || raw[rest] === ';') return true;
  return /^(INTO|USING)\b/i.test(raw.slice(rest));
}

function skipWhitespaceAndComments(raw, index) {
  let i = index;
  while (i < raw.length) {
    if (raw[i] === '-' && raw[i + 1] === '-') {
      i += 2;
      while (i < raw.length && raw[i] !== '\n') i += 1;
    } else if (raw[i] === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, raw.length);
    } else if (/\s/.test(raw[i])) {
      i += 1;
    } else {
      break;
    }
  }
  return i;
}

/**
 * Returns the index just past each top-level EXECUTE word in a statement,
 * skipping comments, strings, quoted identifiers and dollar-quoted regions so
 * an EXECUTE word inside data cannot be mistaken for dynamic SQL.
 */
function collectExecutePositions(raw) {
  const positions = [];
  let index = 0;
  let blockDepth = 0;
  while (index < raw.length) {
    const char = raw[index];
    const next = raw[index + 1];
    if (blockDepth > 0) {
      if (char === '/' && next === '*') { blockDepth += 1; index += 2; }
      else if (char === '*' && next === '/') { blockDepth -= 1; index += 2; }
      else index += 1;
      continue;
    }
    if (char === '-' && next === '-') {
      index += 2;
      while (index < raw.length && raw[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') { blockDepth = 1; index += 2; continue; }
    if (char === "'") {
      const escapeString = index > 0 && (raw[index - 1] === 'E' || raw[index - 1] === 'e');
      index += 1;
      while (index < raw.length) {
        if (escapeString && raw[index] === '\\') index += 2;
        else if (raw[index] === "'" && raw[index + 1] === "'") index += 2;
        else if (raw[index] === "'") { index += 1; break; }
        else index += 1;
      }
      continue;
    }
    if (char === '"') {
      index += 1;
      while (index < raw.length) {
        if (raw[index] === '"' && raw[index + 1] === '"') index += 2;
        else if (raw[index] === '"') { index += 1; break; }
        else index += 1;
      }
      continue;
    }
    if (char === '$' && isDollarDelimiterStart(raw, index)) {
      const delimiter = raw.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)[0];
      const end = raw.indexOf(delimiter, index + delimiter.length);
      if (end < 0) throw new RunnerError('INVALID_SQL_UNTERMINATED_DOLLAR_QUOTE');
      index = end + delimiter.length;
      continue;
    }
    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < raw.length && isIdentifierPart(raw[index])) index += 1;
      if (raw.slice(start, index).toUpperCase() === 'EXECUTE') positions.push(index);
      continue;
    }
    index += 1;
  }
  return positions;
}

function isTriggerDefinition(tokens) {
  const values = tokens.map((token) => token.value);
  if (values[0] !== 'CREATE') return false;
  let offset = 1;
  if (values[offset] === 'OR' && values[offset + 1] === 'REPLACE') offset += 2;
  if (values[offset] === 'EVENT' && values[offset + 1] === 'TRIGGER') return true;
  return values[offset] === 'TRIGGER';
}

function scanLedgerWriteLevel(sql, depth) {
  if (depth > MAX_SCAN_DEPTH) {
    throw new RunnerError('MIGRATION_LEDGER_WRITE_FORBIDDEN', 'scan-depth-exceeded');
  }
  for (const statement of lexExecutableStatements(sql)) {
    rejectHazardousStatement(statement);
    const kind = statementBodyKind(statement.tokens);
    if (kind !== null) {
      const body = kind === 'do'
        ? statement.regions[0]?.content
        : statement.regions.at(-1)?.content;
      if (body === undefined || body === null) {
        throw new RunnerError('MIGRATION_LEDGER_WRITE_UNDETERMINABLE');
      }
      scanLedgerWriteLevel(body, depth + 1);
      continue;
    }
    const hasExecute = statement.tokens.some((token) => !token.quoted && token.value === 'EXECUTE');
    if (!hasExecute) continue;
    // CREATE TRIGGER / CREATE EVENT TRIGGER use EXECUTE FUNCTION/PROCEDURE as
    // grammar, not as dynamic SQL; those statements carry their own hazard
    // checks (a trigger on the ledger is rejected above by the CREATE verb).
    if (isTriggerDefinition(statement.tokens)) continue;
    const positions = collectExecutePositions(statement.raw);
    if (positions.length === 0) throw new RunnerError('MIGRATION_LEDGER_WRITE_UNDETERMINABLE');
    for (const position of positions) {
      const payload = classifyExecutePayload(statement.raw, position);
      if (payload === null || !executePayloadRestIsStaticTail(statement.raw, payload.rest)) {
        throw new RunnerError('MIGRATION_LEDGER_WRITE_UNDETERMINABLE',
          'dynamic-execute-not-statically-proven-safe');
      }
      scanLedgerWriteLevel(payload.content, depth + 1);
    }
    for (const region of statement.regions) scanLedgerWriteLevel(region.content, depth + 1);
  }
}

export function assertNoMigrationLedgerWrites(sql) {
  scanLedgerWriteLevel(sql, 0);
}

export function assertSqlPreflight(sql) {
  assertNoTopLevelTransactionControl(sql);
  assertNoMigrationLedgerWrites(sql);
}

function containedPath(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function safeSqlFile(directory, fileName) {
  if (path.basename(fileName) !== fileName) throw new RunnerError('PATH_TRAVERSAL_REJECTED');
  const joined = path.resolve(directory, fileName);
  if (!containedPath(directory, joined)) throw new RunnerError('PATH_ESCAPE_REJECTED');
  const stat = await lstat(joined);
  assertNotSymbolicLink(stat, fileName);
  if (!stat.isFile()) throw new RunnerError('NON_FILE_SQL_REJECTED', fileName);
  const resolved = await realpath(joined);
  if (!containedPath(directory, resolved)) throw new RunnerError('REALPATH_ESCAPE_REJECTED', fileName);
  const sql = await readFile(resolved, 'utf8');
  assertSqlPreflight(sql);
  return { path: resolved, sql, checksum: sha256(sql) };
}

export function assertNotSymbolicLink(stat, fileName) {
  if (stat.isSymbolicLink()) throw new RunnerError('SYMLINK_SQL_REJECTED', fileName);
}

export async function discoverMigrations(directory = MIGRATIONS_DIRECTORY) {
  const root = await realpath(directory);
  const entries = await readdir(root, { withFileTypes: true });
  const migrations = new Map();
  const rollbacks = new Map();

  for (const entry of entries) {
    if (!entry.name.endsWith('.sql')) continue;
    if (entry.isSymbolicLink()) throw new RunnerError('SYMLINK_SQL_REJECTED', entry.name);
    const rollbackMatch = entry.name.match(ROLLBACK_PATTERN);
    const forwardMatch = entry.name.match(FORWARD_PATTERN);
    const numericPrefix = entry.name.match(/^(\d{1,3})_/);

    if (rollbackMatch) {
      const version = Number(rollbackMatch[1]);
      if (version < MANAGED_VERSION_FLOOR) continue;
      if (rollbacks.has(version)) throw new RunnerError('DUPLICATE_ROLLBACK_VERSION', String(version));
      rollbacks.set(version, { fileName: entry.name, slug: rollbackMatch[2] });
      continue;
    }
    if (forwardMatch) {
      const version = Number(forwardMatch[1]);
      if (version < MANAGED_VERSION_FLOOR) continue;
      if (migrations.has(version)) throw new RunnerError('DUPLICATE_MIGRATION_VERSION', String(version));
      migrations.set(version, { fileName: entry.name, slug: forwardMatch[2] });
      continue;
    }
    if ((numericPrefix && Number(numericPrefix[1]) < MANAGED_VERSION_FLOOR) || LEGACY_NON_NUMERIC_FILES.has(entry.name)) {
      continue;
    }
    throw new RunnerError('INVALID_MIGRATION_FILENAME', entry.name);
  }

  for (const [version, rollback] of rollbacks) {
    const forward = migrations.get(version);
    if (!forward || forward.slug !== rollback.slug) {
      throw new RunnerError('ORPHAN_ROLLBACK_FILE', rollback.fileName);
    }
  }

  const result = [];
  for (const [version, item] of [...migrations.entries()].sort(([a], [b]) => a - b)) {
    const forward = await safeSqlFile(root, item.fileName);
    const rollbackItem = rollbacks.get(version);
    const rollback = rollbackItem ? await safeSqlFile(root, rollbackItem.fileName) : null;
    result.push({
      version,
      key: item.fileName.slice(0, -4),
      fileName: item.fileName,
      ...forward,
      rollback: rollback ? { fileName: rollbackItem.fileName, ...rollback } : null,
    });
  }
  assertLocalMigrationSequence(result);
  return result;
}

export function assertLocalMigrationSequence(migrations) {
  if (migrations.length === 0) return;
  const highest = migrations.at(-1).version;
  const versions = new Set(migrations.map((migration) => migration.version));
  for (let version = MANAGED_VERSION_FLOOR; version <= highest; version += 1) {
    if (!versions.has(version)) throw new RunnerError('LOCAL_MIGRATION_GAP', String(version));
  }
}

export function validateLocalCommand(command, options, migrations) {
  const versions = new Set(migrations.map((migration) => migration.version));
  if (command === 'up' && options.to !== undefined) {
    if (typeof options.to !== 'string' || !/^\d{3}$/.test(options.to) || !versions.has(Number(options.to))) {
      throw new RunnerError('INVALID_TARGET_VERSION');
    }
  }
  if (command === 'down') {
    if (typeof options.confirm !== 'string'
        || !/^\d{3}$/.test(options.confirm)
        || !versions.has(Number(options.confirm))) {
      throw new RunnerError('INVALID_CONFIRMATION');
    }
  }
}

export function validateAppliedState(migrations, rows) {
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const managed = rows.filter((row) => row.runner_managed);
  const versions = new Set();
  const keys = new Set();
  const files = new Set();

  for (const row of managed) {
    if (!['success', 'rolled_back'].includes(row.status)) throw new RunnerError('LEDGER_STATUS_INVALID');
    if (!Number.isInteger(row.migration_version) || row.migration_version < MANAGED_VERSION_FLOOR) {
      throw new RunnerError('MIGRATION_IDENTITY_DRIFT');
    }
    if (versions.has(row.migration_version) || keys.has(row.migration_key) || files.has(row.file_name)) {
      throw new RunnerError('MIGRATION_LEDGER_IDENTITY_CONFLICT');
    }
    versions.add(row.migration_version);
    keys.add(row.migration_key);
    files.add(row.file_name);
    const local = byVersion.get(row.migration_version);
    if (!local) throw new RunnerError('APPLIED_VERSION_MISSING_LOCALLY', String(row.migration_version));
    if (row.migration_key !== local.key || row.file_name !== local.fileName) {
      throw new RunnerError('MIGRATION_IDENTITY_DRIFT', local.fileName);
    }
    if (local.checksum !== row.checksum) throw new RunnerError('CHECKSUM_DRIFT', local.fileName);
    const localRollbackChecksum = local.rollback?.checksum ?? null;
    if ((row.rollback_checksum ?? null) !== localRollbackChecksum) {
      throw new RunnerError('ROLLBACK_CHECKSUM_DRIFT', local.fileName);
    }
    if (row.status === 'rolled_back' && !local.rollback) {
      throw new RunnerError('ROLLBACK_FILE_MISSING', local.fileName);
    }
  }

  const applied = managed
    .filter((row) => row.status === 'success')
    .sort((a, b) => a.migration_version - b.migration_version);
  const appliedVersions = new Set(applied.map((row) => row.migration_version));
  if (applied.length > 0) {
    const highest = applied.at(-1).migration_version;
    for (let version = MANAGED_VERSION_FLOOR; version <= highest; version += 1) {
      if (!byVersion.has(version)) throw new RunnerError('LOCAL_MIGRATION_GAP', String(version));
      if (!appliedVersions.has(version)) throw new RunnerError('APPLIED_VERSION_GAP', String(version));
    }
  }
  return applied;
}

export function isLegacyBaselineRow(row) {
  return !row.runner_managed
    && row.migration_key === LEGACY_BASELINE.migrationKey
    && row.file_name === LEGACY_BASELINE.fileName
    && row.status === LEGACY_BASELINE.status
    && row.executor === LEGACY_BASELINE.executor;
}

export function assertNoLegacyRows(rows) {
  const legacy = rows.filter((row) => !row.runner_managed && !isLegacyBaselineRow(row));
  if (legacy.length > 0) throw new RunnerError('LEGACY_LEDGER_UNRECONCILED', String(legacy.length));
}

export function selectRollbackTarget(applied, confirmation) {
  const latest = applied.at(-1);
  if (!latest) throw new RunnerError('NO_RUNNER_MIGRATION_TO_ROLL_BACK');
  if (String(confirmation ?? '') !== String(latest.migration_version)) {
    throw new RunnerError('INVALID_CONFIRMATION', String(latest.migration_version));
  }
  return latest;
}

export async function acquireAdvisoryLock(client, { timeoutMs = LOCK_TIMEOUT_MS, now = Date.now, wait = defaultWait } = {}) {
  const deadline = now() + timeoutMs;
  do {
    const result = await queryClient(client,
      'SELECT pg_catalog.pg_try_advisory_lock($1, $2) AS locked', ADVISORY_LOCK_KEYS);
    if (result.rows?.[0]?.locked === true) return;
    if (now() >= deadline) break;
    await wait(100);
  } while (true);
  throw new RunnerError('ADVISORY_LOCK_TIMEOUT');
}

async function defaultWait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function releaseAdvisoryLock(client) {
  const result = await queryClient(client,
    'SELECT pg_catalog.pg_advisory_unlock($1, $2) AS unlocked', ADVISORY_LOCK_KEYS);
  if (result.rows?.[0]?.unlocked !== true) throw new RunnerError('ADVISORY_UNLOCK_FAILED');
}

const BASELINE_CATALOG_PREFLIGHT = `
  WITH expected(column_name, type_oid, is_not_null) AS (
    VALUES
      ('id', 'uuid'::pg_catalog.regtype::oid, true),
      ('migration_key', 'varchar'::pg_catalog.regtype::oid, true),
      ('file_name', 'varchar'::pg_catalog.regtype::oid, false),
      ('description', 'text'::pg_catalog.regtype::oid, false),
      ('status', 'varchar'::pg_catalog.regtype::oid, true),
      ('executor', 'varchar'::pg_catalog.regtype::oid, false),
      ('checksum', 'varchar'::pg_catalog.regtype::oid, false),
      ('duration_ms', 'integer'::pg_catalog.regtype::oid, false),
      ('error_message', 'text'::pg_catalog.regtype::oid, false),
      ('executed_at', 'timestamptz'::pg_catalog.regtype::oid, true),
      ('created_at', 'timestamptz'::pg_catalog.regtype::oid, true)
  )
  SELECT
    pg_catalog.to_regclass('public.migration_records') IS NOT NULL AS ledger_exists,
    pg_catalog.to_regclass('public.business_reports') IS NOT NULL AS marker_exists,
    pg_catalog.count(actual.attname) = 11
      AND pg_catalog.bool_and(actual.atttypid = expected.type_oid)
      AND pg_catalog.bool_and(actual.attnotnull = expected.is_not_null) AS columns_match
  FROM expected
  LEFT JOIN pg_catalog.pg_attribute actual
    ON actual.attrelid = pg_catalog.to_regclass('public.migration_records')
   AND actual.attname = expected.column_name
   AND actual.attnum > 0
   AND NOT actual.attisdropped`;

const BASELINE_RECORD_PREFLIGHT = `
  SELECT pg_catalog.count(*)::integer AS matching_rows
    FROM public.migration_records
   WHERE migration_key = $1
     AND file_name = $2
     AND status = $3
     AND executor = $4`;

export async function checkLegacyBaseline(client, { throwOnFailure = true } = {}) {
  const catalog = await queryClient(client, BASELINE_CATALOG_PREFLIGHT);
  const catalogOk = catalog.rows?.[0]?.ledger_exists === true
    && catalog.rows?.[0]?.marker_exists === true
    && catalog.rows?.[0]?.columns_match === true;
  let recordOk = false;
  if (catalogOk) {
    const record = await queryClient(client, BASELINE_RECORD_PREFLIGHT, [
      LEGACY_BASELINE.migrationKey,
      LEGACY_BASELINE.fileName,
      LEGACY_BASELINE.status,
      LEGACY_BASELINE.executor,
    ]);
    recordOk = record.rows?.[0]?.matching_rows === 1;
  }
  const ok = catalogOk && recordOk;
  if (!ok && throwOnFailure) throw new RunnerError('LEGACY_BASELINE_REQUIRED');
  return ok;
}

const LEDGER_SELECT = `
  SELECT id, migration_key, file_name, status, executor, checksum, rollback_checksum, executed_at,
         migration_version, run_id, runner_schema_version, runner_managed, rolled_back_at
    FROM public.migration_records
   ORDER BY migration_version NULLS FIRST, executed_at, migration_key`;

const BOOTSTRAP_POSTCONDITION = `
  SELECT version
    FROM public.migration_runner_schema
   WHERE singleton = true AND version = $1`;

export async function commitTransaction(client, runtime = {}) {
  assertNotInterrupted(runtime);
  runtime.commitInFlight = true;
  try {
    await queryClient(client, 'COMMIT');
    runtime.inTransaction = false;
    runtime.commitSucceeded = true;
  } catch (error) {
    runtime.inTransaction = false;
    throw new RunnerError('COMMIT_OUTCOME_UNKNOWN', 'COMMIT_OUTCOME_UNKNOWN', { cause: error });
  } finally {
    runtime.commitInFlight = false;
  }
}

export async function runInTransaction(client, runtime, operation) {
  assertNotInterrupted(runtime);
  // Once BEGIN succeeds every later interruption or failure is handled inside
  // the try/catch below, so an open transaction always reaches the explicit
  // bestEffortRollback path. No checkpoint may sit between BEGIN and the try.
  const beginError = await beginTransaction(client, runtime);
  if (beginError) throw beginError;
  try {
    assertNotInterrupted(runtime);
    await operation();
    assertNotInterrupted(runtime);
    await commitTransaction(client, runtime);
  } catch (error) {
    const primary = asPrimaryError(error);
    if (primary.code !== 'COMMIT_OUTCOME_UNKNOWN' && runtime.inTransaction) {
      const rollbackError = await bestEffortRollback(client);
      runtime.inTransaction = false;
      if (rollbackError) attachSecondary(primary, rollbackError, runtime.redactionSecrets);
    }
    throw primary;
  }
}

async function beginTransaction(client, runtime) {
  try {
    await queryClient(client, 'BEGIN');
    runtime.inTransaction = true;
    return null;
  } catch (error) {
    return asPrimaryError(error);
  }
}

export async function bootstrapLedger(client, bootstrapSql, runtime = {}) {
  await runInTransaction(client, runtime, async () => {
    await queryClient(client, bootstrapSql);
    assertNotInterrupted(runtime);
    const marker = await queryClient(client, BOOTSTRAP_POSTCONDITION, [RUNNER_SCHEMA_VERSION]);
    assertNotInterrupted(runtime);
    if (marker.rowCount !== 1) throw new RunnerError('BOOTSTRAP_POSTCONDITION_FAILED');
  });
}

export async function readLedger(client, { allowLegacySchema = false } = {}) {
  if (allowLegacySchema) {
    const columns = await queryClient(client,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'migration_records'`
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    if (names.size === 0) throw new RunnerError('LEDGER_BOOTSTRAP_REQUIRED');
    const runnerColumns = ['migration_version', 'run_id', 'runner_schema_version', 'runner_managed', 'rolled_back_at'];
    if (!runnerColumns.every((name) => names.has(name))) {
      const legacy = await queryClient(client,
        `SELECT id, migration_key, file_name, status, checksum, executed_at,
                NULL::integer AS migration_version, NULL::uuid AS run_id,
                NULL::integer AS runner_schema_version, false AS runner_managed,
                NULL::timestamptz AS rolled_back_at, NULL::varchar AS rollback_checksum,
                executor
           FROM public.migration_records
          ORDER BY executed_at, migration_key`
      );
      return legacy.rows;
    }
  }
  const result = await queryClient(client, LEDGER_SELECT);
  return result.rows;
}

async function currentRowsForMigration(client, migration) {
  return queryClient(client,
    `SELECT id, migration_key, file_name, status, checksum, rollback_checksum,
            migration_version, runner_schema_version, runner_managed
       FROM public.migration_records
      WHERE migration_version = $1 OR migration_key = $2 OR file_name = $3
      FOR UPDATE`,
    [migration.version, migration.key, migration.fileName]
  );
}

// Locks the exact target ledger row for the whole rollback transaction so a
// concurrent change to the same row can never let the destructive rollback SQL
// run against a stale or mismatched row. The returned row is revalidated
// exactly before any rollback SQL is sent.
async function lockRollbackTargetRow(client, ledgerRow) {
  return queryClient(client,
    `SELECT id, migration_key, file_name, status, checksum, rollback_checksum,
            migration_version, runner_schema_version, runner_managed
       FROM public.migration_records
      WHERE id = $1 AND runner_managed = true
      FOR UPDATE`,
    [ledgerRow.id]
  );
}

function expectedRollbackChecksum(migration) {
  return migration.rollback?.checksum ?? null;
}

function assertExactMigrationRow(row, migration, status) {
  if (!row.runner_managed
      || row.status !== status
      || row.migration_version !== migration.version
      || row.migration_key !== migration.key
      || row.file_name !== migration.fileName
      || row.checksum !== migration.checksum
      || (row.rollback_checksum ?? null) !== expectedRollbackChecksum(migration)) {
    throw new RunnerError('MIGRATION_IDENTITY_DRIFT', migration.fileName);
  }
}

async function registerMigration(client, migration, runId, priorRows, runtime = {}) {
  const after = await currentRowsForMigration(client, migration);
  assertNotInterrupted(runtime);
  if (priorRows.length > 1 || after.rows.length > 1) {
    throw new RunnerError('MIGRATION_LEDGER_IDENTITY_CONFLICT');
  }

  if (priorRows.length === 1) {
    const old = priorRows[0];
    assertExactMigrationRow(old, migration, 'rolled_back');
    if (after.rows.length !== 1) throw new RunnerError('MIGRATION_IDENTITY_DRIFT');
    assertExactMigrationRow(after.rows[0], migration, 'rolled_back');
    const updated = await queryClient(client,
      `UPDATE public.migration_records
          SET status = 'success', run_id = $1, executed_at = pg_catalog.now(),
              rolled_back_at = NULL, error_message = NULL
        WHERE id = $2
          AND migration_version = $3
          AND migration_key = $4
          AND file_name = $5
          AND runner_managed = true
          AND status = 'rolled_back'
          AND checksum = $6
          AND rollback_checksum IS NOT DISTINCT FROM $7
          AND runner_schema_version = $8`,
      [runId, old.id, migration.version, migration.key, migration.fileName,
        migration.checksum, expectedRollbackChecksum(migration), RUNNER_SCHEMA_VERSION]
    );
    if (updated.rowCount !== 1) throw new RunnerError('LEDGER_REGISTRATION_CAS_FAILED');
    return;
  }

  if (after.rows.length === 0) {
    const inserted = await queryClient(client,
      `INSERT INTO public.migration_records
        (id, migration_key, file_name, description, status, executor, checksum, rollback_checksum,
         duration_ms, error_message, executed_at, created_at, migration_version,
         run_id, runner_schema_version, runner_managed, rolled_back_at)
       VALUES ($1, $2, $3, $4, 'success', 'migration-runner', $5, $6,
               NULL, NULL, pg_catalog.now(), pg_catalog.now(), $7, $8, $9, true, NULL)`,
      [randomUUID(), migration.key, migration.fileName, `Runner migration ${migration.version}`,
        migration.checksum, expectedRollbackChecksum(migration), migration.version, runId, RUNNER_SCHEMA_VERSION]
    );
    if (inserted.rowCount !== 1) throw new RunnerError('LEDGER_REGISTRATION_FAILED');
    return;
  }
  throw new RunnerError('MIGRATION_LEDGER_WRITE_FORBIDDEN');
}

export async function executeMigration(client, migration, runId = randomUUID(), runtime = {}) {
  await runInTransaction(client, runtime, async () => {
    // Static ledger-write guard at the execution boundary: even though every
    // SQL file was already scanned at ingestion, no migration SQL may reach the
    // wire without a fresh fail-closed scan.
    assertNoMigrationLedgerWrites(migration.sql);
    assertNotInterrupted(runtime);
    const prior = await currentRowsForMigration(client, migration);
    assertNotInterrupted(runtime);
    if (prior.rows.length > 1) throw new RunnerError('MIGRATION_LEDGER_IDENTITY_CONFLICT');
    if (prior.rows.length === 1) assertExactMigrationRow(prior.rows[0], migration, 'rolled_back');
    assertNotInterrupted(runtime);
    await queryClient(client, migration.sql);
    assertNotInterrupted(runtime);
    await registerMigration(client, migration, runId, prior.rows, runtime);
    assertNotInterrupted(runtime);
  });
}

export async function executeRollback(client, migration, ledgerRow, runId = randomUUID(), runtime = {}) {
  if (!migration.rollback) throw new RunnerError('ROLLBACK_FILE_MISSING', migration.fileName);
  if (ledgerRow.checksum !== migration.checksum) throw new RunnerError('CHECKSUM_DRIFT', migration.fileName);
  if (ledgerRow.rollback_checksum !== migration.rollback.checksum) {
    throw new RunnerError('ROLLBACK_CHECKSUM_DRIFT', migration.fileName);
  }
  assertExactMigrationRow(ledgerRow, migration, 'success');
  assertNotInterrupted(runtime);
  await runInTransaction(client, runtime, async () => {
    assertNoMigrationLedgerWrites(migration.rollback.sql);
    assertNotInterrupted(runtime);
    // BEGIN -> SELECT target ledger row FOR UPDATE -> exact revalidation ->
    // assertNotInterrupted -> rollback SQL. If the locked row no longer
    // matches (for example another transaction rolled it back concurrently)
    // the rollback SQL must not run and the whole transaction rolls back.
    const locked = await lockRollbackTargetRow(client, ledgerRow);
    assertNotInterrupted(runtime);
    if (locked.rows.length !== 1 || locked.rowCount !== 1) {
      throw new RunnerError('MIGRATION_IDENTITY_DRIFT', migration.fileName);
    }
    assertExactMigrationRow(locked.rows[0], migration, 'success');
    assertNotInterrupted(runtime);
    await queryClient(client, migration.rollback.sql);
    assertNotInterrupted(runtime);
    const updated = await queryClient(client,
      `UPDATE public.migration_records
          SET status = 'rolled_back', run_id = $1, rolled_back_at = pg_catalog.now()
        WHERE id = $2
          AND migration_version = $3
          AND migration_key = $4
          AND file_name = $5
          AND runner_managed = true
          AND status = 'success'
          AND checksum = $6
          AND rollback_checksum = $7
          AND runner_schema_version = $8`,
      [runId, ledgerRow.id, migration.version, migration.key, migration.fileName,
        migration.checksum, migration.rollback.checksum, RUNNER_SCHEMA_VERSION]
    );
    if (updated.rowCount !== 1) throw new RunnerError('ROLLBACK_LEDGER_CAS_FAILED');
    assertNotInterrupted(runtime);
  });
}

export async function bestEffortRollback(client) {
  try {
    await queryClient(client, 'ROLLBACK');
    return null;
  } catch (error) {
    return error;
  }
}

export async function applyPendingMigrations(client, migrations, applied, options = {}, runtime = {}) {
  const maximum = options.to === undefined ? Number.POSITIVE_INFINITY : Number(options.to);
  const runId = options.runId ?? randomUUID;
  const emit = options.output ?? (() => {});
  const appliedVersions = new Set(applied.map((row) => row.migration_version));
  for (const migration of migrations) {
    if (migration.version <= maximum && !appliedVersions.has(migration.version)) {
      assertNotInterrupted(runtime);
      await executeMigration(client, migration, runId(), runtime);
      emit(`APPLIED ${migration.version} ${migration.checksum}`);
      assertNotInterrupted(runtime);
    }
  }
}

export function buildAdoptionPlan(rows, migrations) {
  const filesByName = new Map(migrations.map((migration) => [migration.fileName, migration]));
  return rows.filter((row) => !row.runner_managed && !isLegacyBaselineRow(row)).map((row) => {
    const parsed = String(row.file_name ?? row.migration_key ?? '').match(/^(\d{3})_/);
    const version = parsed ? Number(parsed[1]) : null;
    const local = row.file_name ? filesByName.get(row.file_name) : undefined;
    return {
      migrationKey: row.migration_key,
      fileName: row.file_name,
      candidateVersion: version,
      localFileExists: Boolean(local),
      localSha256: local?.checksum ?? null,
      conflict: row.checksum ? 'legacy-checksum-is-not-runner-proof' : 'legacy-checksum-missing',
      proofRequired: 'prove the exact SQL executed in the target database and approve separate adoption SQL',
    };
  });
}

function parseArguments(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) throw new RunnerError('INVALID_ARGUMENT', item);
    const name = item.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      options[name] = true;
    } else {
      options[name] = value;
      index += 1;
    }
  }
  return { command, options };
}

function assertAllowedOptions(command, options) {
  const allowed = {
    help: new Set(),
    'legacy-disabled': new Set(),
    status: new Set(),
    verify: new Set(['database']),
    up: new Set(['to']),
    down: new Set(['confirm']),
    'adopt-plan': new Set(),
  }[command];
  if (!allowed) return;
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) throw new RunnerError('INVALID_OPTION', `--${name}`);
  }
  if ('database' in options && options.database !== true) {
    throw new RunnerError('INVALID_OPTION_VALUE', '--database');
  }
}

function requireDatabaseUrl(environment) {
  if (!environment.DATABASE_URL) throw new RunnerError('DATABASE_URL_REQUIRED');
  return environment.DATABASE_URL;
}

async function makeClient(databaseUrl) {
  const { Client } = await import('pg');
  return new Client({
    connectionString: databaseUrl,
    application_name: 'quote-project-v2-migration-runner',
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
}

async function readBootstrap() {
  return readFile(BOOTSTRAP_FILE, 'utf8');
}

function printHelp(output) {
  output(`Usage: node scripts/migration-runner.mjs <status|verify|up|down|adopt-plan|help>\n\n` +
    'Database commands use only the existing DATABASE_URL process variable.\n' +
    'Versions 001-126 must be supplied by the separately audited legacy baseline.\n' +
    'The Runner manages only the complete local sequence beginning at 127. Empty databases are unsupported.\n' +
    'down requires: --confirm <latest-version>');
}

function assertNotInterrupted(runtime) {
  if (runtime?.interrupted) throw new RunnerError('RUN_INTERRUPTED');
}

function transitionConnectPhase(runtime, phase) {
  runtime.connectPhase = phase;
  runtime.connectHistory ??= [];
  runtime.connectHistory.push(phase);
}

export async function run(argv, { environment = process.env, output = console.log, errorOutput = console.error,
  clientFactory = makeClient, runtime = {} } = {}) {
  const { command, options } = parseArguments(argv);
  assertAllowedOptions(command, options);
  if (command === 'help') {
    printHelp(output);
    return 0;
  }
  if (command === 'legacy-disabled') {
    errorOutput('Legacy migration entrypoint disabled. Use a reviewed migration:* command.');
    return 2;
  }
  if (!['status', 'verify', 'up', 'down', 'adopt-plan'].includes(command)) {
    throw new RunnerError('UNKNOWN_COMMAND', command);
  }

  const migrations = await discoverMigrations();
  validateLocalCommand(command, options, migrations);
  if (command === 'verify' && options.database !== true) {
    output(`LOCAL_VERIFY_OK migrations=${migrations.length}`);
    return 0;
  }

  const databaseUrl = requireDatabaseUrl(environment);
  const secrets = collectSecretsFromUrl(databaseUrl);
  runtime.redactionSecrets = secrets;
  const client = await clientFactory(databaseUrl);
  runtime.client = client;
  runtime.interrupted ??= false;
  runtime.connectHistory ??= [];
  runtime.connectPhase ??= CONNECT_PHASES.CREATED;
  runtime.connected ??= false;
  let connectAttempted = false;
  let locked = false;
  let resultCode;
  let primaryError = null;
  const cleanupErrors = [];
  try {
    connectAttempted = true;
    transitionConnectPhase(runtime, CONNECT_PHASES.STARTED);
    await client.connect();
    transitionConnectPhase(runtime, CONNECT_PHASES.CONNECTED);
    runtime.connected = true;
    assertNotInterrupted(runtime);

    if (command === 'status' || command === 'adopt-plan' || command === 'verify') {
      const baselineOk = await checkLegacyBaseline(client, { throwOnFailure: false });
      if (!baselineOk) {
        output(JSON.stringify({ status: 'LEGACY_BASELINE_REQUIRED' }, null, 2));
        resultCode = 3;
      } else {
        const rows = await readLedger(client, { allowLegacySchema: true });
        const legacy = rows.filter((row) => !row.runner_managed && !isLegacyBaselineRow(row));
        validateAppliedState(migrations, rows);
        if (command === 'adopt-plan') {
          output(JSON.stringify({ status: legacy.length ? 'LEGACY_LEDGER_UNRECONCILED' : 'OK',
            plan: buildAdoptionPlan(rows, migrations) }, null, 2));
        } else {
          output(JSON.stringify({ status: legacy.length ? 'LEGACY_LEDGER_UNRECONCILED' : 'OK',
            legacyRows: legacy.length }, null, 2));
        }
        resultCode = legacy.length ? 3 : 0;
      }
    } else {
      await acquireAdvisoryLock(client);
      locked = true;
      runtime.locked = true;
      assertNotInterrupted(runtime);
      await checkLegacyBaseline(client);
      assertNotInterrupted(runtime);
      await bootstrapLedger(client, await readBootstrap(), runtime);
      assertNotInterrupted(runtime);
      const rows = await readLedger(client);
      assertNoLegacyRows(rows);
      const applied = validateAppliedState(migrations, rows);

      if (command === 'up') {
        await applyPendingMigrations(client, migrations, applied, {
          to: options.to,
          runId: randomUUID,
          output,
        }, runtime);
        resultCode = 0;
      } else {
        const latest = selectRollbackTarget(applied, options.confirm);
        const migration = migrations.find((item) => item.version === latest.migration_version);
        if (!migration) throw new RunnerError('APPLIED_VERSION_MISSING_LOCALLY');
        await executeRollback(client, migration, latest, randomUUID(), runtime);
        output(`ROLLED_BACK ${migration.version}`);
        assertNotInterrupted(runtime);
        resultCode = 0;
      }
    }
  } catch (error) {
    primaryError = asPrimaryError(error);
  }

  if (locked) {
    try {
      await releaseAdvisoryLock(client);
      runtime.locked = false;
    } catch (error) {
      cleanupErrors.push({ error, operation: 'releaseAdvisoryLock' });
    }
  }
  if (connectAttempted) {
    try {
      await client.end();
      transitionConnectPhase(runtime, CONNECT_PHASES.ENDED);
      runtime.connected = false;
    } catch (error) {
      transitionConnectPhase(runtime, CONNECT_PHASES.END_FAILED);
      cleanupErrors.push({ error, operation: 'end' });
    }
  }

  if (primaryError) {
    for (const cleanupError of cleanupErrors) {
      attachSecondary(primaryError, cleanupError.error, secrets, cleanupError.operation);
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    const cleanupPrimary = asPrimaryError(cleanupErrors[0].error);
    for (const cleanupError of cleanupErrors.slice(1)) {
      attachSecondary(cleanupPrimary, cleanupError.error, secrets, cleanupError.operation);
    }
    throw cleanupPrimary;
  }
  return resultCode;
}

export function installSignalHandlers(runtime, signalSource = process) {
  const signalHandler = (signal) => {
    runtime.interrupted = true;
    runtime.signal ??= signal;
  };
  const sigintHandler = () => signalHandler('SIGINT');
  const sigtermHandler = () => signalHandler('SIGTERM');
  signalSource.once('SIGINT', sigintHandler);
  signalSource.once('SIGTERM', sigtermHandler);
  return () => {
    signalSource.removeListener('SIGINT', sigintHandler);
    signalSource.removeListener('SIGTERM', sigtermHandler);
  };
}

export async function cliMain(argv = process.argv.slice(2), signalSource = process) {
  const runtime = { interrupted: false, signal: null, client: null, connected: false, locked: false };
  const removeSignalHandlers = installSignalHandlers(runtime, signalSource);
  try {
    const code = await run(argv, { runtime });
    return runtime.signal === 'SIGTERM' ? 143 : runtime.interrupted ? 130 : code;
  } catch (error) {
    console.error(formatError(error, collectSecretsFromUrl(process.env.DATABASE_URL)));
    return runtime.signal === 'SIGTERM' ? 143 : runtime.interrupted ? 130 : 1;
  } finally {
    removeSignalHandlers();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await cliMain();
}
