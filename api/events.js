// Impegni dell'agenda. Serve una sessione valida (login).
const L = require('../lib/shared.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const env = L.checkEnv();
    if (env) return L.send(res, 500, { error: env });
    const me = await L.auth(req, res);
    if (!me) return;

    if (req.method === 'GET') {
      const all = L.toObj(await L.redis(['HGETALL', L.K.events]));
      const events = [];
      for (const k of Object.keys(all)) { try { events.push(JSON.parse(all[k])); } catch (_) {} }
      return L.send(res, 200, { events, me: { name: me.name } });
    }

    if (req.method === 'POST') {
      const b = await L.body(req);
      const ev = L.sanitizeEvent(b.event);
      if (!ev) return L.send(res, 400, { error: 'Dati non validi: servono materia e data.' });
      let old = null;
      try { old = JSON.parse(await L.redis(['HGET', L.K.events, ev.id])); } catch (_) {}
      if (!old && (await L.redis(['HLEN', L.K.events])) >= 2000) return L.send(res, 507, { error: 'Agenda piena: chiedi all\'admin di eliminare impegni vecchi.' });
      const full = { ...ev, createdBy: old ? old.createdBy : me.name, createdAt: old ? old.createdAt : Date.now(), updatedBy: me.name, updatedAt: Date.now() };
      await L.redis(['HSET', L.K.events, ev.id, JSON.stringify(full)]);
      await L.redis(['HINCRBY', L.K.edits, me.key, 1]);
      await L.log({ user: me.name, action: old ? 'modifica' : 'crea', type: ev.type, subject: ev.subject, date: ev.date });
      return L.send(res, 200, { event: full });
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return L.send(res, 400, { error: 'Id non valido' });
      let old = null;
      try { old = JSON.parse(await L.redis(['HGET', L.K.events, id])); } catch (_) {}
      await L.redis(['HDEL', L.K.events, id]);
      if (old) {
        await L.redis(['HINCRBY', L.K.edits, me.key, 1]);
        await L.log({ user: me.name, action: 'elimina', type: old.type, subject: old.subject, date: old.date });
      }
      return L.send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return L.send(res, 405, { error: 'Metodo non consentito' });
  } catch (e) {
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
