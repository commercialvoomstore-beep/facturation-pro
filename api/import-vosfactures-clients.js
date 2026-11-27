const VOSFACTURES_CLIENTS_URL = 'https://voomstore.vosfactures.fr/clients.json';
const PAGE_SIZE = 25;
const MAX_PAGE = 10000;

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function cleanName(value) {
  return clean(value).replace(/^[.·•]+\s*/, '').trim();
}

function uniqueJoin(values, separator = ' ; ') {
  const seen = new Set();
  return values
    .map(clean)
    .filter(value => value && !seen.has(value.toLocaleLowerCase('fr-FR')))
    .filter(value => {
      const key = value.toLocaleLowerCase('fr-FR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(separator);
}

function dateOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function mapClient(client) {
  const externalId = clean(client?.id);
  if (!externalId) return null;

  const firstName = cleanName(client?.first_name);
  const lastName = cleanName(client?.last_name);
  const contact = [firstName, lastName].filter(Boolean).join(' ');
  const name = cleanName(client?.name) || contact || cleanName(client?.shortcut) || `Client VosFactures ${externalId}`;
  const street = [clean(client?.street_no), clean(client?.street)].filter(Boolean).join(' ');
  const address = [street, clean(client?.post_code), clean(client?.city), clean(client?.country)]
    .filter(Boolean)
    .join(', ');

  const row = {
    source: 'vosfactures',
    external_id: externalId,
    nom: name,
    nom_usage_interne: cleanName(client?.shortcut),
    numero_fiscal: clean(client?.tax_no),
    emails: clean(client?.email),
    telephones: uniqueJoin([client?.phone, client?.mobile_phone]),
    contact,
    address,
    city: clean(client?.city),
    country: clean(client?.country),
    post_code: clean(client?.post_code),
    register_number: clean(client?.register_number),
    numero_registre: clean(client?.register_number),
    external_created_at: dateOrNull(client?.created_at),
    external_updated_at: dateOrNull(client?.updated_at)
  };

  const createdAt = dateOrNull(client?.created_at);
  const updatedAt = dateOrNull(client?.updated_at);
  if (createdAt) row.created_at = createdAt;
  if (updatedAt) row.updated_at = updatedAt;
  return row;
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = async function importVosFacturesClients(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  const authorization = String(req.headers.authorization || '').trim();
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    sendJson(res, 401, { ok: false, error: 'Session Supabase requise.' });
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || req.headers.apikey || '').trim();
  const apiToken = String(process.env.VOSFACTURES_API_TOKEN || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    sendJson(res, 500, { ok: false, error: 'La configuration Supabase du serveur est incomplète.' });
    return;
  }
  if (!apiToken) {
    sendJson(res, 503, { ok: false, error: 'Le token VosFactures n’est pas configuré côté serveur.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const requestedPage = Number(body?.page || 1);
  const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(MAX_PAGE, requestedPage)) : 1;

  try {
    // Vérifie le JWT de l’utilisateur avec la clé publique. La clé service_role n’est pas utilisée.
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: authorization }
    });
    if (!userResponse.ok) {
      sendJson(res, 401, { ok: false, error: 'Session Supabase invalide ou expirée.' });
      return;
    }

    const apiUrl = new URL(VOSFACTURES_CLIENTS_URL);
    apiUrl.searchParams.set('page', String(page));
    apiUrl.searchParams.set('per_page', String(PAGE_SIZE));
    apiUrl.searchParams.set('api_token', apiToken);
    const apiResponse = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      redirect: 'error'
    });
    const payload = await readJson(apiResponse);

    if (!apiResponse.ok) {
      sendJson(res, 502, {
        ok: false,
        error: `VosFactures a refusé la page ${page} (HTTP ${apiResponse.status}). Vérifiez le token configuré côté serveur.`
      });
      return;
    }
    if (!Array.isArray(payload)) {
      sendJson(res, 502, { ok: false, error: 'Réponse VosFactures inattendue : la liste de clients est absente.' });
      return;
    }

    const rows = [];
    const seen = new Set();
    for (const client of payload) {
      const row = mapClient(client);
      if (!row || seen.has(row.external_id)) continue;
      seen.add(row.external_id);
      rows.push(row);
    }

    if (rows.length) {
      const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/contacts?on_conflict=source%2Cexternal_id`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: authorization,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
      });
      if (!upsertResponse.ok) {
        const errorPayload = await readJson(upsertResponse);
        const detail = clean(errorPayload?.message || errorPayload?.hint || 'Vérifiez le schéma et les droits RLS de public.contacts.');
        sendJson(res, 502, { ok: false, error: `Écriture Supabase impossible : ${detail}` });
        return;
      }
    }

    sendJson(res, 200, {
      ok: true,
      page,
      received: payload.length,
      synchronized: rows.length,
      skipped: payload.length - rows.length,
      hasMore: payload.length === PAGE_SIZE
    });
  } catch (error) {
    console.error('Import VosFactures impossible', error instanceof Error ? error.message : error);
    sendJson(res, 502, { ok: false, error: 'La synchronisation VosFactures est indisponible pour le moment.' });
  }
};
