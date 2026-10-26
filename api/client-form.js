const crypto = require('node:crypto');

const BRAND_NAMES = {
  voom: 'Voomstore',
  voomnettech: 'Voomnet Technology',
  maginfo: 'Magasin Informatique',
  onduleurs: 'Onduleurs',
  licences: 'Licences',
  groupes: 'Groupes électrogènes',
  legrand: 'Le Grand Bâtiment',
  starlink: 'Starlink CI',
  entreprise: 'Entreprise Informatique',
  cabinetvf: 'Cabinet VF'
};

const MAX_BODY_BYTES = 100_000;
const MAX_ITEMS = 20;
const NUMBERING_YEAR = 2620;
const DEFAULT_DELIVERY_TERMS = 'Sous 10 à 15 jours ouvrables à compter du paiement par chèque ou Virement (à compter de la réception du règlement)';
const DEFAULT_INVOICE_NOTE = `>>Modalité de Règlement accordée au client:
Paiement intégral à la commande + Bon de commande (Cachet + signature)
-------------------------------------------
>> Tous nos règlements Acceptés
( Espèce, Orange Money, Paypal, Carte Bancaire, Virement ou Chèque) doivent être libellés au nom de "VOOMNET TECHNOLOGY"
-------------------------------------------
>> NB:
La garantie ne couvre pas la perte, le vol et la casse.
Les produits sur commande ne sont ni repris et ne peuvent être retournés.
Dans le cadre d’une vente à un professionnel (organisme public ou privé) la rétractation ne peut être appliquée.
Dès signature d'un bon de commande, le client ne peut en aucun cas se rétracter (Aucun remboursement partiel ou total ne sera accepté quelque soit le motif)
Le client ne peut en aucun cas se rétracter après le versement d’un acompte quelque soit le motif qui pourrait être évoqué.
Une fois le bon de commande signée la vente est définitive et le client a l'obligation de régler la somme convenu.`;

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, max);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function uuid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function serviceConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, key };
}

async function supabaseRest(path, options = {}) {
  const { url, key } = serviceConfig();
  if (!url || !key) throw new Error('Server Supabase configuration is incomplete.');
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const detail = clean(data?.message || data?.hint || data?.details || '', 300);
    const error = new Error(detail || `Supabase request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function findExistingContact({ email, ncc, rccm, phone }) {
  const candidates = [
    ['emails', email],
    ['numero_fiscal', ncc],
    ['numero_registre', rccm],
    ['telephones', phone]
  ];
  for (const [column, value] of candidates) {
    if (!value) continue;
    const rows = await supabaseRest(`/rest/v1/contacts?select=id&${column}=eq.${encodeURIComponent(value)}&limit=1`);
    if (Array.isArray(rows) && rows[0]?.id) return String(rows[0].id);
  }
  return null;
}

async function upsertContact({ requestId, company, ncc, rccm, location, contact, email, phone }) {
  const existingId = await findExistingContact({ email, ncc, rccm, phone });
  const now = new Date().toISOString();
  const row = {
    source: 'client_form',
    external_id: `client-form:${requestId}`,
    nom: company,
    nom_usage_interne: company,
    numero_fiscal: ncc,
    numero_registre: rccm,
    register_number: rccm,
    emails: email,
    telephones: phone,
    contact,
    address: location,
    created_at: now,
    updated_at: now
  };
  if (existingId) {
    const rows = await supabaseRest(`/rest/v1/contacts?id=eq.${encodeURIComponent(existingId)}&select=id`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...row, updated_at: now })
    });
    return rows?.[0]?.id ? String(rows[0].id) : existingId;
  }
  const rows = await supabaseRest('/rest/v1/contacts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0]?.id ? String(rows[0].id) : null;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function normalizedSubmission(body) {
  const token = clean(body?.token, 180);
  const company = clean(body?.company, 180);
  const ncc = clean(body?.ncc, 80);
  const rccm = clean(body?.rccm, 100);
  const location = cleanMultiline(body?.location, 500);
  const validationContact = clean(body?.validationContact, 180);
  const email = clean(body?.email, 180).toLowerCase();
  const phone = clean(body?.phone, 80);
  const paymentMethod = body?.paymentMethod === 'cash' ? 'Espèces' : body?.paymentMethod === 'transfer' ? 'Virement bancaire' : '';
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS).map(item => ({
    reference: clean(item?.reference, 180),
    quantity: Number(item?.quantity)
  })) : [];
  return { token, company, ncc, rccm, location, validationContact, email, phone, paymentMethod, items };
}

function validateSubmission(data) {
  const errors = [];
  if (!data.token || data.token.length < 24) errors.push('Lien de formulaire invalide.');
  if (!data.company) errors.push('Le nom de l’entreprise est obligatoire.');
  if (!data.ncc) errors.push('Le NCC est obligatoire.');
  if (!data.rccm) errors.push('Le RCCM est obligatoire.');
  if (!data.location) errors.push('La localisation est obligatoire.');
  if (!data.validationContact) errors.push('La personne chargée de la validation est obligatoire.');
  if (!/^\S+@\S+\.\S+$/.test(data.email)) errors.push('L’adresse e-mail est invalide.');
  if (!data.phone || data.phone.length < 6) errors.push('Le numéro de téléphone est obligatoire.');
  if (!data.paymentMethod) errors.push('Le mode de paiement est obligatoire.');
  if (!data.items.length) errors.push('Ajoutez au moins une référence à commander.');
  const normalizedContact = data.validationContact.toLocaleLowerCase('fr-FR');
  if (data.items.some(item => item.reference.toLocaleLowerCase('fr-FR') === normalizedContact)) errors.push('La personne en charge doit être un nom, pas une référence produit.');
  if (data.items.some(item => !item.reference || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    errors.push('Chaque référence doit avoir une quantité supérieure à zéro.');
  }
  return errors;
}

function brandCode(brandId) {
  return ({ voom: 'VOOM', voomnettech: 'VNT', maginfo: 'MAGINF', onduleurs: 'ONDUL', licences: 'LIC', groupes: 'GE', legrand: 'LEGR', starlink: 'STAR', entreprise: 'ENTINF', cabinetvf: 'CABVF' })[brandId] || String(brandId).slice(0, 5).toUpperCase();
}

function profileForDocument(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return { ...source };
}

async function getLink(token) {
  const hash = tokenHash(token);
  const rows = await supabaseRest(`/rest/v1/client_form_links?token_hash=eq.${hash}&active=eq.true&select=id,owner_user_id,brand_id,profile_snapshot,expires_at,submission_count&limit=1`);
  const link = Array.isArray(rows) ? rows[0] : null;
  if (!link) return null;
  if (link.expires_at && Date.parse(link.expires_at) < Date.now()) return null;
  if (!BRAND_NAMES[link.brand_id]) return null;
  return link;
}

async function createSubmission(data, link) {
  const requestId = uuid();
  const contactId = await upsertContact({
    requestId,
    company: data.company,
    ncc: data.ncc,
    rccm: data.rccm,
    location: data.location,
    contact: data.validationContact,
    email: data.email,
    phone: data.phone
  });

  const submittedAt = new Date().toISOString();
  const request = {
    id: requestId,
    owner_user_id: link.owner_user_id,
    form_link_id: link.id,
    brand_id: link.brand_id,
    status: 'proforma_created',
    source: 'client_form',
    company_name: data.company,
    ncc: data.ncc,
    rccm: data.rccm,
    location: data.location,
    validation_contact: data.validationContact,
    email: data.email,
    phone: data.phone,
    payment_method: data.paymentMethod,
    contact_id: contactId,
    raw_data: {
      company: data.company,
      ncc: data.ncc,
      rccm: data.rccm,
      location: data.location,
      validationContact: data.validationContact,
      email: data.email,
      phone: data.phone,
      paymentMethod: data.paymentMethod,
      items: data.items
    },
    submitted_at: submittedAt,
    created_at: submittedAt,
    updated_at: submittedAt
  };
  await supabaseRest('/rest/v1/customer_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(request)
  });

  const itemRows = data.items.map(item => ({ request_id: requestId, reference: item.reference, quantity: item.quantity }));
  await supabaseRest('/rest/v1/customer_request_items', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(itemRows)
  });

  const year = NUMBERING_YEAR;
  const numberRows = await supabaseRest('/rest/v1/rpc/next_proforma_number_for_user', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: link.owner_user_id, p_brand_id: link.brand_id, p_year: year, p_brand_code: brandCode(link.brand_id) })
  });
  const number = String(numberRows || '').trim();
  if (!number) throw new Error('Proforma number could not be generated.');

  const items = data.items.map(item => ({
    id: uuid(),
    designation: item.reference,
    description: '',
    reference: item.reference,
    qty: String(item.quantity),
    unit: 'u',
    price: ''
  }));
  const draft = {
    mode: 'standard',
    clientCompany: data.company,
    clientContact: data.validationContact,
    clientPhone: data.phone,
    clientEmail: data.email,
    clientAddress: data.location,
    clientNcc: data.ncc,
    clientRcc: data.rccm,
    clientId: contactId || '',
    clientVisibility: { company: true, contact: true, phone: true, email: true, address: true, ncc: true, rcc: true },
    invoiceTitle: '',
    items,
    turboClient: '',
    turboLabel: '',
    turboTtc: '',
    date: today(),
    validDays: 15,
    issuePlace: '',
    docRef: `REQ-${requestId.slice(0, 8).toUpperCase()}`,
    deliveryDate: '',
    paymentDue: '',
    paymentMethod: data.paymentMethod,
    deliveryTerms: DEFAULT_DELIVERY_TERMS,
    vatRate: 18,
    note: DEFAULT_INVOICE_NOTE
  };
  const profileSnapshot = {
    ...profileForDocument(link.profile_snapshot),
    brandId: link.brand_id,
    brandName: BRAND_NAMES[link.brand_id]
  };
  const proformaId = uuid();
  await supabaseRest('/rest/v1/proformas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: proformaId,
      user_id: link.owner_user_id,
      brand_id: link.brand_id,
      number,
      status: 'pending_pricing',
      source: 'client_form',
      request_id: requestId,
      validation_status: 'pending',
      issue_date: today(),
      data: draft,
      amount: 0,
      profile_snapshot: profileSnapshot,
      created_at: submittedAt,
      updated_at: submittedAt,
      deleted_at: null
    })
  });

  await supabaseRest(`/rest/v1/customer_requests?id=eq.${requestId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ proforma_id: proformaId, updated_at: new Date().toISOString() })
  });
  await supabaseRest(`/rest/v1/client_form_links?id=eq.${link.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ used_at: link.used_at || submittedAt, submission_count: Number(link.submission_count || 0) + 1 })
  });

  return {
    requestId,
    proformaId,
    number,
    brandId: link.brand_id,
    brandName: BRAND_NAMES[link.brand_id],
    status: 'pending_pricing',
    source: 'client_form'
  };
}

module.exports = async function clientForm(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!['GET', 'POST'].includes(req.method)) { json(res, 405, { ok: false, error: 'Méthode non autorisée.' }); return; }

  const body = parseBody(req);
  const token = clean(req.query?.token || body?.token, 180);
  if (!token) { json(res, 400, { ok: false, error: 'Lien de formulaire incomplet.' }); return; }
  const config = serviceConfig();
  if (!config.url || !config.key) { json(res, 503, { ok: false, error: 'Le formulaire public n’est pas encore configuré côté serveur.' }); return; }

  try {
    const link = await getLink(token);
    if (!link) { json(res, 404, { ok: false, error: 'Ce lien de formulaire est invalide ou expiré.' }); return; }
    if (req.method === 'GET') {
      json(res, 200, { ok: true, brandId: link.brand_id, brandName: BRAND_NAMES[link.brand_id] });
      return;
    }
    const submission = normalizedSubmission({ ...body, token });
    const errors = validateSubmission(submission);
    if (errors.length) { json(res, 422, { ok: false, error: errors[0], errors }); return; }
    const result = await createSubmission(submission, link);
    json(res, 201, { ok: true, ...result, message: 'Votre demande a bien été reçue. La proforma sera finalisée par notre équipe.' });
  } catch (error) {
    console.error('Client form submission failed:', error instanceof Error ? error.message : error);
    json(res, 500, { ok: false, error: 'La demande n’a pas pu être enregistrée. Réessayez ou contactez l’équipe.' });
  }
};
