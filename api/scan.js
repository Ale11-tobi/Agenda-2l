// Legge la foto di un foglio (interrogazioni/verifiche) con Gemini (piano gratuito) e restituisce una bozza.
// Solo admin. Non salva nulla: l'inserimento avviene dopo l'anteprima, da /api/admin.
const L = require('../lib/shared.js');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function prompt(today) {
  return `Sei l'assistente di una classe 2L del liceo scientifico opzione scienze applicate (biennio, Italia).
Nella foto c'è un foglio, scritto a mano o stampato, con nomi di studenti interrogati e/o verifiche, con i giorni.
Oggi è ${today} (formato AAAA-MM-GG). Le date sul foglio sono italiane (giorno/mese): deduci l'anno dal contesto, scegliendo la data più vicina a oggi nel futuro (o molto recente).

Estrai ogni impegno come un elemento. Regole:
- type: "interrogazione" se ci sono nomi di studenti interrogati, "verifica" se è una verifica scritta o compito in classe.
- Raggruppa in un solo elemento tutti i nomi che hanno la stessa materia e lo stesso giorno, in "who" separati da virgola.
- subject: la materia (es. Matematica, Fisica, Italiano, Inglese, Storia e Geografia, Informatica, Scienze naturali, Disegno e Storia dell'arte, Scienze motorie, Religione). Se non è scritta, lascia "" e metti uncertain true.
- date: AAAA-MM-GG. Se non riesci a capirla, lascia "" e metti uncertain true.
- topic: argomento se scritto, altrimenti "".
- Non inventare nulla. Se una parola o un nome è poco leggibile, scrivi la tua migliore lettura, metti uncertain true e spiega in "note" (breve, in italiano).
Rispondi SOLO con JSON in questa forma:
{"items":[{"type":"interrogazione","subject":"","date":"","who":"","topic":"","uncertain":false,"note":""}],"comment":"breve commento in italiano, vuoto se non serve"}`;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const env = L.checkEnv();
    if (env) return L.send(res, 500, { error: env });
    if (!process.env.ADMIN_CODE) return L.send(res, 500, { error: 'Manca la variabile ADMIN_CODE su Vercel.' });
    if (req.method !== 'POST') return L.send(res, 405, { error: 'Metodo non consentito' });
    if (await L.blocked(req, 'admin', 10)) return L.send(res, 429, { error: 'Troppi tentativi sbagliati. Riprova tra 10 minuti.' });
    const given = L.str(req.headers['x-admin-code'], 100);
    if (!given || !L.safeEq(given, process.env.ADMIN_CODE)) {
      if (given) await L.fail(req, 'admin');
      return L.send(res, 401, { error: 'Codice admin sbagliato.' });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) return L.send(res, 500, { error: 'Manca la variabile GEMINI_API_KEY su Vercel (chiave gratuita di Google AI Studio).' });

    const b = await L.body(req);
    const image = typeof b.image === 'string' ? b.image.replace(/^data:[^,]*,/, '') : '';
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(image) || image.length < 200) return L.send(res, 400, { error: 'Foto non valida.' });
    if (image.length > 4000000) return L.send(res, 413, { error: 'Foto troppo grande.' });
    const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today || '') ? b.today : new Date().toISOString().slice(0, 10);

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(today) }, { inline_data: { mime_type: 'image/jpeg', data: image.replace(/\s/g, '') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (r.status === 429) return L.send(res, 429, { error: 'Limite gratuito di Google raggiunto. Riprova tra un minuto.' });
    if (r.status === 400 || r.status === 403) {
      let j = null; try { j = await r.json(); } catch (_) {}
      const msg = (j && j.error && j.error.message) || '';
      if (/API key/i.test(msg)) return L.send(res, 502, { error: 'Chiave Gemini non valida: controlla GEMINI_API_KEY su Vercel.' });
      return L.send(res, 502, { error: 'Google non ha accettato la foto. Prova con un\'altra foto più nitida.' });
    }
    if (!r.ok) return L.send(res, 502, { error: 'Il servizio di lettura non risponde (' + r.status + '). Riprova tra poco.' });

    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    const out = parseJson(text);
    if (!out || !Array.isArray(out.items)) return L.send(res, 502, { error: 'Non sono riuscito a leggere il foglio. Riprova con una foto più nitida.' });

    const items = out.items.slice(0, 60).map((x) => {
      const date = L.str(x && x.date, 10);
      const subject = L.str(x && x.subject, 60);
      const type = x && x.type === 'verifica' ? 'verifica' : 'interrogazione';
      return {
        type, subject, date: validDate(date) ? date : '',
        who: type === 'interrogazione' ? L.str(x && x.who, 120) : '',
        topic: L.str(x && x.topic, 140),
        uncertain: !!(x && x.uncertain) || !subject || !validDate(date),
        note: L.str(x && x.note, 200),
      };
    });
    return L.send(res, 200, { items, comment: L.str(out.comment, 300) });
  } catch (e) {
    return L.send(res, 500, { error: 'Errore del server. Riprova tra poco.' });
  }
};
