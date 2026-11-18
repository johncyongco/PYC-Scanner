import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { STAFF_PASSWORD, N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET, SCANNER_ORIGIN } = process.env;
if (![STAFF_PASSWORD, N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET, SCANNER_ORIGIN].every(Boolean) ||
    STAFF_PASSWORD.length < 16 || N8N_WEBHOOK_SECRET.length < 24) {
  throw Error('Configure scanner origin, webhook URL, and both secrets.');
}
const origin = new URL(SCANNER_ORIGIN).origin;
const webhook = new URL(N8N_WEBHOOK_URL);
if (new URL(origin).protocol !== 'https:' || !['http:', 'https:'].includes(webhook.protocol)) {
  throw Error('Use HTTPS for the scanner origin and HTTP(S) for the webhook.');
}
const digest = value => createHash('sha256').update(value).digest();
const access = digest('Basic ' + Buffer.from('gate:' + STAFF_PASSWORD).toString('base64'));
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/unfold-header.webp', ['public/unfold-header.webp', 'image/webp']],
  ['/manifest.webmanifest', ['public/manifest.webmanifest', 'application/manifest+json']],
  ['/icon-192.png', ['public/icon-192.png', 'image/png']],
  ['/icon-512.png', ['public/icon-512.png', 'image/png']],
  ['/qr.js', ['node_modules/jsqr/dist/jsQR.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['public/sw.js', 'text/javascript; charset=utf-8']],
].map(([url, [file, mime]]) => [url, [readFileSync(new URL(file, import.meta.url)), mime]]));

const html = assets.get('/')[0].toString('utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const styleHash = createHash('sha256').update(style).digest('base64');

let queue = Promise.resolve();
let pending = 0;
const codePattern = /^UNF-[A-F0-9]{16}$/;
const outcomes = new Set(['present', 'already_present', 'not_found', 'unpaid', 'duplicate_code']);
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}
async function forward(code) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Checkin-Key': N8N_WEBHOOK_SECRET },
    body: JSON.stringify({ code }),
    redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw Error('n8n returned ' + response.status);
  const result = await response.json();
  if (!outcomes.has(result.status)) throw Error('Unexpected webhook response');
  return { status: result.status, name: result.name, checkedInAt: result.checkedInAt };
}

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(self)');
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; style-src 'self' 'sha256-${styleHash}'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
  if (!timingSafeEqual(access, digest(req.headers.authorization ?? ''))) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="UNFOLD Check-in"' });
    res.end('Staff sign-in required');
    return;
  }
  if (req.method === 'GET' && assets.has(req.url)) {
    const [body, mime] = assets.get(req.url);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(body);
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/scan') return reply(res, 404, { status: 'not_found' });
  if (req.headers.origin !== origin) return reply(res, 403, { status: 'forbidden' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { status: 'invalid' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512) return reply(res, 413, { status: 'invalid' });
    }
    const { code } = JSON.parse(body);
    if (typeof code !== 'string' || !codePattern.test(code)) return reply(res, 400, { status: 'invalid' });
    if (pending >= 8) return reply(res, 503, { status: 'unavailable' });
    pending++;
    const task = queue.then(() => forward(code)).finally(() => pending--);
    queue = task.catch(() => {});
    return reply(res, 200, await task);
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent) reply(res, 502, { status: 'unavailable' });
  }
}).listen(8080, '0.0.0.0');
