const { graphConfigured, senderFor, sendGraphMail } = require('./microsoft-graph');
const { buildPdf, buildEmailHtml, logoAssetForInvoice } = require('./invoice-renderer');

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

function money(value) {
  const amount = Number(value) || 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} FCFA`;
}

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || serviceKey).trim();
  return { url, serviceKey, anonKey };
}

async function rest(path, options = {}) {
  const { url, serviceKey } = config();
  if (!url || !serviceKey) throw new Error('La configuration Supabase serveur est incomplète.');
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
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

async function authenticatedUser(accessToken) {
  const { url, anonKey } = config();
  if (!url || !anonKey) throw new Error('La vérification Supabase serveur est incomplète.');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const error = new Error('Session Supabase invalide ou expirée.');
    error.status = 401;
    throw error;
  }
  return response.json();
}

async function getProforma(invoiceId, userId) {
  const rows = await rest(`/rest/v1/proformas?id=eq.${encodeURIComponent(invoiceId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,request_id,brand_id,number,status,issue_date,data,amount,profile_snapshot,deleted_at&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function getLatestDelivery(invoiceId) {
  const rows = await rest(`/rest/v1/proforma_email_deliveries?proforma_id=eq.${encodeURIComponent(invoiceId)}&select=id,attempt_number,status,provider,provider_message_id,sent_at,recipient_email,error_message,created_at,updated_at&order=attempt_number.desc&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function saveDelivery(deliveryId, row) {
  if (deliveryId) {
    const rows = await rest(`/rest/v1/proforma_email_deliveries?id=eq.${encodeURIComponent(deliveryId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
    return rows?.[0] || { id: deliveryId, ...row };
  }
  const rows = await rest('/rest/v1/proforma_email_deliveries', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] || row;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

module.exports = async function sendProformaEmail(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Méthode non autorisée.' }); return; }

  const authorization = String(req.headers.authorization || '');
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const body = parseBody(req);
  const invoiceId = clean(body.proformaId, 100);
  const resend = body.resend === true;
  if (!accessToken || !invoiceId) { res.status(400).json({ ok: false, error: 'Session ou proforma manquante.' }); return; }

  try {
    if (!graphConfigured()) { res.status(503).json({ ok: false, error: 'L’envoi Microsoft 365 n’est pas encore configuré côté serveur.' }); return; }
    const user = await authenticatedUser(accessToken);
    const invoice = await getProforma(invoiceId, user.id);
    if (!invoice) { res.status(404).json({ ok: false, error: 'Proforma introuvable dans votre périmètre.' }); return; }
    if (invoice.deleted_at || ['draft', 'pending_pricing', 'deleted', 'cancelled'].includes(String(invoice.status || '').toLowerCase()) || !Number.isFinite(Number(invoice.amount)) || Number(invoice.amount) <= 0) {
      res.status(422).json({ ok: false, error: 'Cette proforma doit être enregistrée avec un montant supérieur à zéro avant son envoi.' });
      return;
    }
    const data = invoice.data && typeof invoice.data === 'object' ? invoice.data : {};
    const recipient = clean(data.clientEmail, 180).toLowerCase();
    if (!validEmail(recipient)) { res.status(422).json({ ok: false, error: 'La proforma ne contient pas d’adresse e-mail client valide.' }); return; }
    const sender = senderFor(invoice.brand_id);
    const previous = await getLatestDelivery(invoice.id);
    if (previous?.status === 'sent' && previous?.provider === 'microsoft-graph' && !resend) {
      res.status(200).json({ ok: true, alreadySent: true, attemptNumber: Number(previous.attempt_number) || 1, messageId: previous.provider_message_id || null });
      return;
    }
    if (previous?.status === 'sending') {
      res.status(409).json({ ok: false, alreadyProcessing: true, error: 'Un envoi de cette proforma est déjà en cours.' });
      return;
    }

    const now = new Date().toISOString();
    const attemptNumber = (Number(previous?.attempt_number) || 0) + 1;
    let delivery;
    try {
      delivery = await saveDelivery(null, {
        proforma_id: invoice.id,
        user_id: user.id,
        brand_id: invoice.brand_id,
        recipient_email: recipient,
        sender_email: sender.email,
        provider: 'microsoft-graph',
        attempt_number: attemptNumber,
        status: 'sending',
        error_message: null,
        created_at: now,
        updated_at: now
      });
    } catch (error) {
      if (error.status === 409) {
        res.status(409).json({ ok: false, alreadyProcessing: true, error: 'Un envoi de cette proforma est déjà en cours.' });
        return;
      }
      throw error;
    }
    let pdf;
    try {
      pdf = await buildPdf(invoice, sender);
    } catch (error) {
      const message = clean(error?.message || 'Le PDF de la proforma n’a pas pu être généré.', 300);
      await saveDelivery(delivery.id, { status: 'failed', error_message: message, sent_at: null });
      res.status(500).json({ ok: false, error: message });
      return;
    }
    const pdfFilename = `${invoice.number}.pdf`;
    const logoAsset = logoAssetForInvoice(invoice);
    const logoCid = logoAsset ? `invoice-logo-${clean(invoice.id, 80)}` : '';
    let graphResult;
    try {
      graphResult = await sendGraphMail({
        sender,
        to: [recipient],
        subject: `Votre proforma ${invoice.number} — ${sender.name}`,
        text: `Bonjour ${data.clientCompany || data.clientContact || 'Client'},\n\nVeuillez trouver en pièce jointe votre proforma ${invoice.number}.\n\nTotal TTC : ${money(invoice.amount)}\n\n${sender.name}`,
        html: buildEmailHtml(invoice, sender, pdfFilename, { logoCid }),
        attachments: [
          {
            name: pdfFilename,
            contentType: 'application/pdf',
            contentBytes: pdf.toString('base64')
          },
          ...(logoAsset ? [{
            name: `${invoice.number}-logo.${logoAsset.extension}`,
            contentType: logoAsset.mime,
            contentBytes: logoAsset.buffer.toString('base64'),
            isInline: true,
            contentId: logoCid
          }] : [])
        ]
      });
    } catch (error) {
      const message = clean(error?.message || 'Microsoft Graph a refusé l’envoi.', 300);
      await saveDelivery(delivery.id, { status: 'failed', error_message: message, sent_at: null });
      res.status(error?.status === 422 ? 422 : 502).json({ ok: false, error: message });
      return;
    }
    await saveDelivery(delivery.id, { status: 'sent', provider_message_id: graphResult.messageId || null, error_message: null, sent_at: new Date().toISOString() });
    res.status(201).json({ ok: true, sent: true, resent: attemptNumber > 1, attemptNumber, messageId: graphResult.messageId || null, recipient });
  } catch (error) {
    console.error('Proforma e-mail failed:', error instanceof Error ? error.message : error);
    res.status(error.status === 401 ? 401 : 500).json({ ok: false, error: error.status === 401 ? 'Session Supabase expirée.' : 'La proforma existe mais son envoi e-mail a échoué.' });
  }
};
