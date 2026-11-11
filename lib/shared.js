// Funzioni condivise dalle API: database, sessioni, log.
const crypto = require('crypto');

// Vercel può aggiungere un prefisso ai nomi (es. STORAGE_KV_REST_API_URL): li riconosciamo tutti.
function findEnv(re) {
  for (const k of Object.keys(process.env)) if (re.test(k) && process.env[k]) return process.env[k];
  return '';
}
const DB_URL = findEnv(/(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/);
const DB_TOKEN = findEnv(/(^|_)(KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)$/);

const K = { events: 'agenda2l', users: 'u:users', seen: 'u:seen', logins: 'u:logins', edits: 'u:edits', sess: 'u:sess', log: 'u:log' };

async function post(path, body) {
  const r = await fetch(DB_URL + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('db');
  return j;
}
async function redis(cmd) {
  const j = await post('', cmd);
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function multi(cmds) {
  const j = await post('/pipeline', cmds);
  return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}
function toObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  else if (flat && typeof flat === 'object') Object.assign(o, flat);
  return o;
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(a), 'hex'), Buffer.from(sha(b), 'hex'));
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function send(res, code, obj) { res.status(code).json(obj); }

function checkEnv() {
  if (!DB_URL || !DB_TOKEN) return 'Database non collegato: su Vercel apri Storage, collega Upstash Redis e fai un nuovo deploy.';
  if (!process.env.CLASS_CODE) return 'Manca la variabile CLASS_CODE su Vercel (il codice classe).';
  return '';
}

async function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}

function ip(req) { return str((req.headers['x-forwarded-for'] || '').split(',')[0], 60) || 'x'; }
async function blocked(req, bucket, max) {
  const n = Number(await redis(['GET', 'rl:' + bucket + ':' + ip(req)])) || 0;
  return n >= max;
}
async function fail(req, bucket) {
  const key = 'rl:' + bucket + ':' + ip(req);
  const n = await redis(['INCR', key]);
  if (n === 1) await redis(['EXPIRE', key, 600]);
}

const normName = (n) => str(n, 30).replace(/\s+/g, ' ');
const nameKey = (n) => normName(n).toLowerCase();
const validName = (n) => /^[\p{L}\p{N} .'-]{2,30}$/u.test(normName(n));

async function log(entry) {
  await multi([['LPUSH', K.log, JSON.stringify({ t: Date.now(), ...entry })], ['LTRIM', K.log, 0, 999]]);
}

// Controlla la sessione. Se non valida risponde da solo e restituisce null.
async function auth(req, res) {
  const token = str(req.headers['x-session'], 100);
  if (!token) { send(res, 401, { error: 'Accedi per continuare.' }); return null; }
  const key = await redis(['HGET', K.sess, sha(token)]);
  if (!key) { send(res, 401, { error: 'Sessione scaduta, accedi di nuovo.' }); return null; }
  const [u, seen] = await multi([['HGET', K.users, key], ['HGET', K.seen, key]]);
  let user = null;
  try { user = JSON.parse(u); } catch (_) {}
  if (!user) { send(res, 401, { error: 'Account non trovato, accedi di nuovo.' }); return null; }
  if (user.banned) { send(res, 403, { banned: true, error: 'Sei stato espulso dall\'agenda.' }); return null; }
  if (Date.now() - (Number(seen) || 0) > 60000) await redis(['HSET', K.seen, key, Date.now()]);
  return { key, name: user.name };
}

function sanitizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const date = str(ev.date, 10);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date + 'T00:00:00Z'));
  const subject = str(ev.subject, 60);
  if (!valid || !subject) return null;
  const type = ev.type === 'interrogazione' ? 'interrogazione' : 'verifica';
  return {
    id: /^[A-Za-z0-9_-]{6,40}$/.test(ev.id || '') ? ev.id : crypto.randomUUID(),
    type, subject, date,
    topic: str(ev.topic, 140),
    who: type === 'interrogazione' ? str(ev.who, 120) : '',
    notes: str(ev.notes, 400),
  };
}

module.exports = { K, redis, multi, toObj, sha, safeEq, str, send, checkEnv, body, blocked, fail, normName, nameKey, validName, log, auth, sanitizeEvent };
