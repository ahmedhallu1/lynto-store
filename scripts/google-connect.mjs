// One-time Google sign-in for the cashier-sheet import. Gets a READ-ONLY Google Sheets refresh token for the owner's account
// and stores client id/secret + refresh token as Worker secrets (and in .secrets/*.env so later deploys keep them).
//   node scripts/google-connect.mjs <oauth-client.json> [--env staging|production|both] [--no-upload]
// The OAuth client must allow the redirect URI http://localhost:5555/oauth2callback. Nothing secret is printed.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const envArg = args.includes('--env') ? args[args.indexOf('--env') + 1] : 'both';
const upload = !args.includes('--no-upload');
if (!file || !existsSync(file)) { console.error('Usage: node scripts/google-connect.mjs <oauth-client.json> [--env staging|production|both] [--no-upload]'); process.exit(2); }

const json = JSON.parse(readFileSync(file, 'utf8'));
const client = json.web ?? json.installed;
const REDIRECT = 'http://localhost:5555/oauth2callback';
if (!client?.client_id || !client?.client_secret) { console.error('Not an OAuth client JSON (needs web/installed client_id and client_secret).'); process.exit(2); }
if (client.redirect_uris && !client.redirect_uris.includes(REDIRECT)) { console.error(`The OAuth client does not allow ${REDIRECT}; add it in Google Cloud → Credentials.`); process.exit(2); }

const SHEET_ID = '1x4MOXfUGd1peIUjY-DbcfAy03HtzD-RqrH0fUUWSLKs';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const state = crypto.randomBytes(16).toString('hex');
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
  include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256',
});

function setEnvLines(path, values) {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), line) : (text.endsWith('\n') || !text ? text : text + '\n') + line + '\n';
  }
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function finish(code) {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: verifier }),
  }).then((r) => r.json());
  if (!tok.refresh_token) throw new Error(`Google did not return a refresh token (${tok.error ?? 'unknown'}: ${tok.error_description ?? ''}).`);
  // Check the account can query the sheet the way the Worker does.
  const tq = "select A, C limit 1";
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${new URLSearchParams({ tqx: 'out:json', sheet: 'Transactions', headers: '1', tq })}`, { headers: { authorization: `Bearer ${tok.access_token}` }, redirect: 'manual' });
  const body = await res.text();
  const ok = res.status === 200 && body.includes('"status":"ok"');
  console.log(ok ? '✓ Read-only access to the cashier sheet works.' : `✗ Sheet query check failed (HTTP ${res.status}). ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
  const values = { GOOGLE_CLIENT_ID: client.client_id, GOOGLE_CLIENT_SECRET: client.client_secret, GOOGLE_REFRESH_TOKEN: tok.refresh_token };
  const envs = envArg === 'both' ? ['staging', 'production'] : [envArg];
  for (const e of envs) {
    setEnvLines(join(root, '.secrets', `${e}.env`), values);
    console.log(`✓ Saved to .secrets/${e}.env`);
    if (upload) {
      const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
      execFileSync(process.execPath, [wrangler, 'secret', 'bulk', ...(e === 'staging' ? ['--env', 'staging'] : [])], { cwd: root, input: JSON.stringify(values), stdio: ['pipe', 'inherit', 'inherit'] });
      console.log(`✓ Uploaded Worker secrets (${e})`);
    }
  }
  return ok;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:5555');
  if (u.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
  const done = (msg) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<p style="font:16px system-ui;padding:2rem">${msg}</p>`); };
  if (u.searchParams.get('state') !== state) { done('State mismatch — start again.'); return; }
  if (u.searchParams.get('error')) { done('Access was not granted. You can close this tab.'); console.error('Google returned: ' + u.searchParams.get('error')); server.close(); process.exitCode = 1; return; }
  try {
    const ok = await finish(u.searchParams.get('code'));
    done(ok ? 'LYnto is connected to the cashier sheet (read-only). You can close this tab.' : 'Connected, but the sheet check failed — see the terminal.');
    if (!ok) process.exitCode = 1;
  } catch (e) {
    done('Something went wrong — see the terminal.'); console.error(String(e?.message ?? e)); process.exitCode = 1;
  }
  server.close();
});
server.listen(5555, 'localhost', () => {
  console.log('Open this link and sign in with the Google account that can open the cashier sheet (read-only access):\n\n' + authUrl + '\n');
  if (process.platform === 'darwin' && !args.includes('--no-open')) spawn('open', [authUrl], { stdio: 'ignore', detached: true }).unref();
});
