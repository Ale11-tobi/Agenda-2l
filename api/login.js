// Accesso con nome + codice classe. DELETE = esci.
const L = require('../lib/shared.js');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const env = L.checkEnv();
    if (env) return L.send(res, 500, { error: env });

    if (req.method === 'DELETE') {
      const t = L.str(req.headers['x-session'], 100);
      if (t) await L.redis(['HDEL', L.K.sess, L.sha(t)]);
      return L.send(res, 200, { ok: true });
    }
    if (req.method !== 'POST') return L.send(res, 405, { error: 'Metodo non consentito' });

    if (await L.blocked(req, 'login', 10)) return L.send(res, 429, { error: 'Troppi tentativi sbagliati. Riprova tra 10 minuti.' });
    const b = await L.body(req);
    if (!L.validName(b.name)) return L.send(res, 400, { error: 'Scrivi il tuo nome (da 2 a 30 caratteri).' });
    if (!b.code || !L.safeEq(b.code, process.env.CLASS_CODE)) {
      await L.fail(req, 'login');
      return L.send(res, 401, { error: 'Codice classe sbagliato.' });
    }

    const name = L.normName(b.name), key = L.nameKey(name), now = Date.now();
    let user = null;
    try { user = JSON.parse(await L.redis(['HGET', L.K.users, key])); } catch (_) {}
    if (user && user.banned) return L.send(res, 403, { banned: true, error: 'Sei stato espulso dall\'agenda.' });
    if (!user) {
      user = { name, createdAt: now, banned: false };
      await L.redis(['HSET', L.K.users, key, JSON.stringify(user)]);
      await L.log({ user: name, action: 'nuovo' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    await L.multi([
      ['HSET', L.K.sess, L.sha(token), key],
      ['HSET', L.K.seen, key, now],
      ['HINCRBY', L.K.logins, key, 1],
    ]);
    await L.log({ user: user.name, action: 'accesso' });
    return L.send(res, 200, { token, name: user.name });
  } catch (e) {
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
