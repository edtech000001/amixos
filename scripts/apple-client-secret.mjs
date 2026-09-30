#!/usr/bin/env node
/**
 * Mints the Apple "client secret" JWT that Supabase needs for Sign In with Apple.
 *
 * Usage:  node scripts/apple-client-secret.mjs /path/to/AuthKey_XXXXXXXXXX.p8
 *
 * The JWT is copied to the clipboard (macOS) instead of printed, so it never
 * lands in shell history or a terminal scrollback.
 *
 * Apple caps the lifetime at 6 months — this must be regenerated and pasted
 * back into Supabase before it expires, or web Apple sign-in fails with
 * "Unsupported provider: missing OAuth secret".
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TEAM_ID = 'UVUMLGQYVM';
const SERVICES_ID = 'com.amixos.web';
const MAX_LIFETIME = 15777000; // 6 months, Apple's hard ceiling

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Usage: node scripts/apple-client-secret.mjs /path/to/AuthKey_XXXX.p8');
  process.exit(1);
}

// Apple names the download AuthKey_<KeyID>.p8, so the Key ID comes from the
// filename unless it is passed explicitly as the second argument.
const KEY_ID = process.argv[3] ?? (keyPath.match(/AuthKey_([A-Z0-9]{10})\.p8$/)?.[1] ?? null);
if (!KEY_ID) {
  console.error('Could not read the Key ID from the filename. Pass it explicitly:');
  console.error('  node scripts/apple-client-secret.mjs <key.p8> <KEY_ID>');
  process.exit(1);
}

const privateKey = readFileSync(keyPath, 'utf8');
if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  console.error(`${keyPath} does not look like a .p8 private key.`);
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const exp = now + MAX_LIFETIME;

const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
const payload = b64url(
  JSON.stringify({
    iss: TEAM_ID,
    iat: now,
    exp,
    aud: 'https://appleid.apple.com',
    sub: SERVICES_ID,
  })
);

const signer = createSign('SHA256');
signer.update(`${header}.${payload}`);
// Apple wants the raw r||s form, not the DER wrapper Node emits by default.
const signature = b64url(signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }));

const jwt = `${header}.${payload}.${signature}`;

try {
  execFileSync('pbcopy', { input: jwt });
  console.log('Client secret copied to clipboard.');
} catch {
  console.log('Clipboard unavailable — writing to apple-client-secret.txt instead.');
  const { writeFileSync } = await import('node:fs');
  writeFileSync('apple-client-secret.txt', jwt, { mode: 0o600 });
}

console.log(`Key ID:      ${KEY_ID}`);
console.log(`Services ID: ${SERVICES_ID}`);
console.log(`Expires:     ${new Date(exp * 1000).toISOString().slice(0, 10)}  <-- regenerate before this date`);
