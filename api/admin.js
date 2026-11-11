// Portale admin: protetto da ADMIN_CODE (header x-admin-code).
const L = require('../lib/shared.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const env = L.checkEnv();
    if (env) return L.send(res, 500, { error: env });
    if (!process.env.ADMIN_CODE) return L.send(res, 500, { error: 'Manca la variabile ADMIN_CODE su Vercel.' });
    if (await L.blocked(req, 'admin', 10)) return L.send(res, 429, { error: 'Troppi tentativi sbagliati. Riprova tra 10 minuti.' });
    const given = L.str(req.headers['x-admin-code'], 100);
    if (!given || !L.safeEq(given, process.env.ADMIN_CODE)) {
      if (given) await L.fail(req, 'admin');
      return L.send(res, 401, { error: 'Codice admin sbagliato.' });
    }

    if (req.method === 'GET') {
      const [users, seen, logins, edits, log, events] = await L.multi([
        ['HGETALL', L.K.users], ['HGETALL', L.K.seen], ['HGETALL', L.K.logins], ['HGETALL', L.K.edits],
        ['LRANGE', L.K.log, 0, 299], ['HGETALL', L.K.events],
      ]);
      const U = L.toObj(users), S = L.toObj(seen), LG = L.toObj(logins), E = L.toObj(edits);
      const list = [];
      for (const key of Object.keys(U)) {
        let u = null; try { u = JSON.parse(U[key]); } catch (_) {}
        if (u) list.push({ key, name: u.name, createdAt: u.createdAt, banned: !!u.banned, lastSeen: Number(S[key]) || 0, logins: Number(LG[key]) || 0, edits: Number(E[key]) || 0 });
      }
      const ev = [];
      const EV = L.toObj(events);
      for (const k of Object.keys(EV)) { try { ev.push(JSON.parse(EV[k])); } catch (_) {} }
      const lg = (log || []).map((x) => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean);
      return L.send(res, 200, { users: list, log: lg, events: ev, now: Date.now() });
    }

    if (req.method === 'POST') {
      const b = await L.body(req);
      const key = L.str(b.key, 40), action = L.str(b.action, 20);
      if (action === 'delevent') {
        const id = L.str(b.id, 40);
        let old = null; try { old = JSON.parse(await L.redis(['HGET', L.K.events, id])); } catch (_) {}
        await L.redis(['HDEL', L.K.events, id]);
        await L.log({ user: 'Admin', action: 'admin-evento', subject: old ? old.subject : '', type: old ? old.type : '', date: old ? old.date : '' });
        return L.send(res, 200, { ok: true });
      }
      let u = null; try { u = JSON.parse(await L.redis(['HGET', L.K.users, key])); } catch (_) {}
      if (!u) return L.send(res, 404, { error: 'Account non trovato.' });

      const dropSessions = async () => {
        const all = L.toObj(await L.redis(['HGETALL', L.K.sess]));
        const del = Object.keys(all).filter((h) => all[h] === key);
        if (del.length) await L.redis(['HDEL', L.K.sess, ...del]);
      };
      if (action === 'ban') { u.banned = true; await L.redis(['HSET', L.K.users, key, JSON.stringify(u)]); }
      else if (action === 'unban') { u.banned = false; await L.redis(['HSET', L.K.users, key, JSON.stringify(u)]); }
      else if (action === 'logout') { await dropSessions(); }
      else if (action === 'delete') {
        await dropSessions();
        await L.multi([['HDEL', L.K.users, key], ['HDEL', L.K.seen, key], ['HDEL', L.K.logins, key], ['HDEL', L.K.edits, key]]);
      } else return L.send(res, 400, { error: 'Azione non valida.' });
      await L.log({ user: 'Admin', action: 'admin-' + action, target: u.name });
      return L.send(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return L.send(res, 405, { error: 'Metodo non consentito' });
  } catch (e) {
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
