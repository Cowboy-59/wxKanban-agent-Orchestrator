// [SCOPE 043 / T026] Amendment E — FR-024 credential redaction and FR-023 bounding.
// Pure (no vscode), per the cockpit test convention. This is the half that has
// to be right: a log is exactly where a connection string ends up, and the
// submitter attaching it is usually not thinking about that.
import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_BYTES,
  isAllowedExtension,
  looksBinary,
  redactSecrets,
  tailSlice,
  toChip,
} from '../src/services/attachmentText.js';

describe('redactSecrets (FR-024)', () => {
  it('masks a labelled value but keeps the key readable', () => {
    const { text, redactions } = redactSecrets('DB_PASSWORD=hunter2please\nport=5432');
    expect(text).toContain('DB_PASSWORD=[redacted]');
    // Non-secret settings must survive — a scrubbed log still has to be useful.
    expect(text).toContain('port=5432');
    expect(redactions).toBe(1);
  });

  it('handles the JSON shape as well as the env shape', () => {
    const { text } = redactSecrets('{"apiKey": "sk-live-abcdef123456", "retries": 3}');
    expect(text).toContain('[redacted]');
    expect(text).not.toContain('sk-live-abcdef123456');
    expect(text).toContain('"retries": 3');
  });

  it('masks a bearer token', () => {
    const { text, redactions } = redactSecrets('Authorization: Bearer abcdefghijklmnop123');
    expect(text).not.toContain('abcdefghijklmnop123');
    expect(redactions).toBeGreaterThanOrEqual(1);
  });

  it('masks a JWT that carries no labelling key', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const { text } = redactSecrets(`token issued: ${jwt}`);
    expect(text).not.toContain(jwt);
    expect(text).toContain('[redacted]');
  });

  it('masks an AWS access key id', () => {
    const { text } = redactSecrets('using AKIAIOSFODNN7EXAMPLE for upload');
    expect(text).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('masks a password in a connection URI but keeps host and user', () => {
    const { text } = redactSecrets('postgres://appuser:s3cr3tpw@db.internal:5432/wxkanban');
    expect(text).not.toContain('s3cr3tpw');
    expect(text).toContain('appuser');
    expect(text).toContain('db.internal:5432/wxkanban');
  });

  it('masks a whole private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    const { text } = redactSecrets(`key follows\n${pem}\ndone`);
    expect(text).not.toContain('MIIEowIBAAKCAQEA');
    expect(text).toContain('done');
  });

  it('leaves an ordinary log untouched and reports zero', () => {
    const log = '12:00:01 INFO started\n12:00:02 ERROR connection refused to 10.0.0.4';
    const { text, redactions } = redactSecrets(log);
    expect(text).toBe(log);
    expect(redactions).toBe(0);
  });

  it('is idempotent — re-scanning masked text finds nothing new', () => {
    const once = redactSecrets('password=hunter2please');
    const twice = redactSecrets(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.redactions).toBe(0);
  });
});

describe('tailSlice (FR-023)', () => {
  it('leaves a small file alone', () => {
    const { text, truncated } = tailSlice(Buffer.from('short log\n'));
    expect(text).toBe('short log\n');
    expect(truncated).toBe(false);
  });

  it('keeps the END of a large file — the failure is at the end', () => {
    const big = Buffer.from('A'.repeat(MAX_FILE_BYTES) + '\nFATAL: the thing that broke\n');
    const { text, truncated } = tailSlice(big);
    expect(truncated).toBe(true);
    expect(text).toContain('FATAL: the thing that broke');
    expect(text.length).toBeLessThanOrEqual(MAX_FILE_BYTES + 200);
  });

  it('says what it dropped rather than truncating silently', () => {
    const { text } = tailSlice(Buffer.from('B'.repeat(MAX_FILE_BYTES + 5_000)));
    expect(text).toContain('earlier bytes omitted');
  });

  it('does not leave a partial multi-byte character at the cut', () => {
    // A 3-byte character straddling the slice boundary must not survive as a
    // replacement char — the cut advances to the first line break.
    const body = `${'x'.repeat(50)}\n${'日'.repeat(60_000)}`;
    const buf = Buffer.from('C'.repeat(MAX_FILE_BYTES) + '\n' + body);
    const { text } = tailSlice(buf);
    expect(text).not.toContain('�');
  });
});

describe('extension allowlist and binary detection', () => {
  it('accepts the text formats a log arrives as', () => {
    expect(isAllowedExtension('app.log')).toBe(true);
    expect(isAllowedExtension('OUTPUT.TXT')).toBe(true);
    expect(isAllowedExtension('trace.json')).toBe(true);
  });

  it('rejects binary and executable formats by name', () => {
    expect(isAllowedExtension('screenshot.png')).toBe(false);
    expect(isAllowedExtension('tool.exe')).toBe(false);
    expect(isAllowedExtension('noextension')).toBe(false);
  });

  it('catches a binary file wearing a text extension', () => {
    // A PNG renamed to .log passes the allowlist; the NUL check is what stops it.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(looksBinary(png)).toBe(true);
    expect(looksBinary(Buffer.from('plain text log line\n'))).toBe(false);
  });
});

describe('toChip', () => {
  it('carries the metadata to the webview and nothing else', () => {
    const chip = toChip({ name: 'a.log', bytes: 900, truncated: true, redactions: 2, content: 'secret stuff' });
    expect(chip).toEqual({ name: 'a.log', bytes: 900, truncated: true, redactions: 2 });
    expect(JSON.stringify(chip)).not.toContain('secret stuff');
  });
});
