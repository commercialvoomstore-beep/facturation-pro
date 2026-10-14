const PDFDocument = require('pdfkit');

const BRAND_NAMES = {
  voom: 'Voomstore',
  maginfo: 'Magasin Informatique',
  onduleurs: 'Onduleurs',
  licences: 'Licences',
  groupes: 'Groupes électrogènes',
  legrand: 'Le Grand Bâtiment',
  starlink: 'Starlink CI',
  entreprise: 'Entreprise Informatique',
  cabinetvf: 'Voomnet Formation'
};

const BRAND_ENV_KEYS = {
  voom: 'VOOM',
  maginfo: 'MAGINFO',
  onduleurs: 'ONDULEURS',
  licences: 'LICENCES',
  groupes: 'GROUPES',
  legrand: 'LEGRAND',
  starlink: 'STARLINK',
  entreprise: 'ENTREPRISE',
  cabinetvf: 'CABINETVF'
};

// These are public business addresses, not credentials. Each address must be
// verified in Resend before it can be used as a sender.
const DEFAULT_SENDERS = {
  voom: 'contact@voomstore.ci',
  maginfo: 'contact@magasininformatique.ci',
  onduleurs: 'contact@onduleurs.ci',
  licences: 'contact@licences.ci',
  groupes: 'contact@groupeselectrogenes.ci',
  legrand: 'contact@legrandbatiment.ci',
  starlink: 'contact@starlinkci.ci',
  entreprise: 'contact@entrepriseinformatique.ci',
  cabinetvf: 'contact@voomnetformation.ci'
};

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
}

function pdfText(value) {
  return String(value ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

function money(value) {
  const amount = Number(value) || 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} FCFA`;
}

function numberValue(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function itemRows(data) {
  return (Array.isArray(data?.items) ? data.items : [])
    .filter(item => String(item?.designation || '').trim())
    .map(item => {
      const quantity = item?.unit === 'forfait' ? 1 : numberValue(item?.qty);
      const price = numberValue(item?.price);
      return {
        reference: String(item?.reference || '').trim(),
        designation: String(item?.designation || '').trim(),
        quantity,
        unit: String(item?.unit || 'u'),
        price,
        total: quantity * price
      };
    });
}

function senderFor(brandId) {
  const key = BRAND_ENV_KEYS[brandId];
  if (!key) throw new Error('Marque de facturation inconnue.');
  const email = clean(process.env[`RESEND_FROM_${key}`] || DEFAULT_SENDERS[brandId], 180).toLowerCase();
  const replyTo = clean(process.env[`RESEND_REPLY_TO_${key}`] || email, 180).toLowerCase();
  if (!validEmail(email)) throw new Error(`Adresse d’envoi absente ou invalide pour ${BRAND_NAMES[brandId]}.`);
  if (!validEmail(replyTo)) throw new Error(`Adresse de réponse absente ou invalide pour ${BRAND_NAMES[brandId]}.`);
  const name = clean(process.env[`RESEND_FROM_NAME_${key}`] || BRAND_NAMES[brandId], 120);
  return { email, replyTo, name };
}

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || serviceKey).trim();
  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  return { url, serviceKey, anonKey, resendKey };
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
  const rows = await rest(`/rest/v1/proformas?id=eq.${encodeURIComponent(invoiceId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,request_id,brand_id,number,status,issue_date,data,amount,profile_snapshot&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function getDelivery(invoiceId) {
  const rows = await rest(`/rest/v1/proforma_email_deliveries?proforma_id=eq.${encodeURIComponent(invoiceId)}&select=id,status,provider_message_id,sent_at&limit=1`);
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

function buildPdf(invoice, sender) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const document = new PDFDocument({ size: 'A4', margin: 42, info: {
      Title: `Facture ${invoice.number}`,
      Author: sender.name,
      Subject: 'Proforma'
    }});
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const data = invoice.data && typeof invoice.data === 'object' ? invoice.data : {};
    const profile = invoice.profile_snapshot && typeof invoice.profile_snapshot === 'object' ? invoice.profile_snapshot : {};
    const brandName = BRAND_NAMES[invoice.brand_id] || invoice.brand_id;
    const accent = invoice.brand_id === 'cabinetvf' ? '#5A1B89' : '#315C9A';
    const rows = itemRows(data);
    const clientName = data.clientCompany || data.clientContact || 'Client';

    document.fillColor(accent).rect(0, 0, 595, 16).fill();
    document.fillColor('#17243B').font('Helvetica-Bold').fontSize(20).text(pdfText(profile.company || brandName), 42, 42, { width: 300 });
    document.fillColor('#637083').font('Helvetica').fontSize(9).text(pdfText(profile.address || ''), 42, 70, { width: 280 });
    document.text(pdfText([profile.phone, profile.email].filter(Boolean).join(' · ')), 42, 84, { width: 280 });
    document.fillColor(accent).font('Helvetica-Bold').fontSize(19).text('FACTURE PROFORMA', 345, 48, { width: 208, align: 'right' });
    document.fillColor('#17243B').fontSize(11).text(pdfText(invoice.number), 345, 76, { width: 208, align: 'right' });
    document.fillColor('#637083').font('Helvetica').fontSize(9).text(`Date : ${pdfText(invoice.issue_date || data.date || '')}`, 345, 93, { width: 208, align: 'right' });

    document.strokeColor('#DDE3EB').lineWidth(1).moveTo(42, 126).lineTo(553, 126).stroke();
    document.fillColor('#17243B').font('Helvetica-Bold').fontSize(10).text('CLIENT', 42, 148);
    document.font('Helvetica').fontSize(10).text(pdfText(clientName), 42, 167, { width: 240 });
    document.fillColor('#637083').fontSize(9).text(pdfText([data.clientContact, data.clientAddress, data.clientPhone, data.clientEmail].filter(Boolean).join('\n')), 42, 186, { width: 240, lineGap: 2 });
    document.fillColor('#17243B').font('Helvetica-Bold').fontSize(10).text('REGLEMENT', 360, 148);
    document.font('Helvetica').fontSize(9).text(pdfText([data.paymentMethod || 'A definir', data.paymentDue === 'at_order' ? 'A la commande' : data.paymentDue].filter(Boolean).join('\n')), 360, 167, { width: 190, lineGap: 2 });

    let y = 254;
    document.fillColor(accent).rect(42, y, 511, 25).fill();
    document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('DESIGNATION', 52, y + 8);
    document.text('QTE', 330, y + 8, { width: 38, align: 'right' });
    document.text('PRIX HT', 385, y + 8, { width: 66, align: 'right' });
    document.text('TOTAL HT', 465, y + 8, { width: 78, align: 'right' });
    y += 25;
    document.font('Helvetica').fontSize(8.5).fillColor('#18202D');
    for (const row of rows) {
      const description = pdfText([row.reference, row.designation].filter(Boolean).join(' · '));
      const height = Math.max(24, document.heightOfString(description, { width: 250 }) + 10);
      if (y + height > 710) { document.addPage(); y = 50; }
      document.fillColor(y % 2 ? '#F7F9FC' : '#FFFFFF').rect(42, y, 511, height).fill();
      document.fillColor('#18202D').font('Helvetica').fontSize(8.5).text(description, 52, y + 8, { width: 250 });
      document.text(`${row.quantity} ${pdfText(row.unit)}`, 300, y + 8, { width: 68, align: 'right' });
      document.text(money(row.price), 375, y + 8, { width: 76, align: 'right' });
      document.text(money(row.total), 462, y + 8, { width: 81, align: 'right' });
      y += height;
    }
    const amount = numberValue(invoice.amount);
    const vatRate = numberValue(data.vatRate) === 18 ? 18 : 0;
    const ht = vatRate ? Math.round(amount / 1.18) : amount;
    const vat = amount - ht;
    y += 18;
    document.fillColor('#17243B').font('Helvetica').fontSize(9).text('Total hors taxes', 355, y, { width: 110 });
    document.font('Helvetica-Bold').text(money(ht), 465, y, { width: 78, align: 'right' });
    y += 17;
    document.font('Helvetica').text(`TVA ${vatRate} %`, 355, y, { width: 110 });
    document.font('Helvetica-Bold').text(money(vat), 465, y, { width: 78, align: 'right' });
    y += 22;
    document.fillColor(accent).font('Helvetica-Bold').fontSize(13).text('TOTAL TTC', 355, y, { width: 110 });
    document.text(money(amount), 465, y, { width: 78, align: 'right' });
    y += 42;
    document.fillColor('#637083').font('Helvetica').fontSize(8.5);
    if (data.deliveryTerms) { document.text(pdfText(`Livraison / execution : ${data.deliveryTerms}`), 42, y, { width: 511 }); y += 30; }
    if (data.note) document.text(pdfText(`Note / conditions : ${data.note}`), 42, y, { width: 511, lineGap: 2 });
    document.fillColor('#637083').fontSize(8).text(pdfText(`${sender.name} · ${sender.email}`), 42, 800, { width: 511, align: 'center' });
    document.end();
  });
}

function buildEmailHtml(invoice, sender, pdfFilename) {
  const data = invoice.data && typeof invoice.data === 'object' ? invoice.data : {};
  const profile = invoice.profile_snapshot && typeof invoice.profile_snapshot === 'object' ? invoice.profile_snapshot : {};
  const brandName = BRAND_NAMES[invoice.brand_id] || invoice.brand_id;
  const client = data.clientCompany || data.clientContact || 'Client';
  const rows = itemRows(data).map(row => `<tr><td>${htmlEscape(row.designation)}</td><td style="text-align:right">${htmlEscape(row.quantity)} ${htmlEscape(row.unit)}</td><td style="text-align:right">${htmlEscape(money(row.total))}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7fb;color:#18202d;font-family:Arial,sans-serif"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="height:8px;background:#5A1B89"></div><div style="padding:28px 32px"><p style="margin:0;color:#5A1B89;font-size:12px;font-weight:bold;letter-spacing:1px">${htmlEscape(brandName).toUpperCase()}</p><h1 style="margin:12px 0 4px;font-size:25px">Votre proforma</h1><p style="margin:0;color:#637083">${htmlEscape(invoice.number)}</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p>Bonjour ${htmlEscape(client)},</p><p>Veuillez trouver en pièce jointe votre proforma <strong>${htmlEscape(invoice.number)}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:22px 0"><thead><tr style="background:#f3ecf8"><th style="text-align:left;padding:10px">Désignation</th><th style="text-align:right;padding:10px">Quantité</th><th style="text-align:right;padding:10px">Total HT</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-size:18px"><strong>Total TTC : ${htmlEscape(money(invoice.amount))}</strong></p><p style="color:#637083;font-size:13px;line-height:1.6">Pour toute question, répondez directement à cet e-mail.</p><p style="margin-top:28px;font-size:13px"><strong>${htmlEscape(profile.company || brandName)}</strong><br>${htmlEscape(profile.phone || '')}<br>${htmlEscape(profile.email || sender.email)}</p><p style="color:#9aa6b3;font-size:11px">Document PDF joint : ${htmlEscape(pdfFilename)}</p></div></div></body></html>`;
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
  if (!accessToken || !invoiceId) { res.status(400).json({ ok: false, error: 'Session ou proforma manquante.' }); return; }

  try {
    const { resendKey } = config();
    if (!resendKey) { res.status(503).json({ ok: false, error: 'L’envoi e-mail n’est pas encore configuré côté serveur.' }); return; }
    const user = await authenticatedUser(accessToken);
    const invoice = await getProforma(invoiceId, user.id);
    if (!invoice) { res.status(404).json({ ok: false, error: 'Proforma introuvable dans votre périmètre.' }); return; }
    const data = invoice.data && typeof invoice.data === 'object' ? invoice.data : {};
    const recipient = clean(data.clientEmail, 180).toLowerCase();
    if (!validEmail(recipient)) { res.status(422).json({ ok: false, error: 'La proforma ne contient pas d’adresse e-mail client valide.' }); return; }
    const sender = senderFor(invoice.brand_id);
    const previous = await getDelivery(invoice.id);
    if (previous?.status === 'sent') {
      res.status(200).json({ ok: true, alreadySent: true, messageId: previous.provider_message_id || null });
      return;
    }

    const now = new Date().toISOString();
    const delivery = await saveDelivery(previous?.id, {
      proforma_id: invoice.id,
      user_id: user.id,
      brand_id: invoice.brand_id,
      recipient_email: recipient,
      sender_email: sender.email,
      provider: 'resend',
      status: 'sending',
      error_message: null,
      updated_at: now,
      created_at: previous?.id ? undefined : now
    });
    const pdf = await buildPdf(invoice, sender);
    const pdfFilename = `${invoice.number}.pdf`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${sender.name} <${sender.email}>`,
        to: [recipient],
        reply_to: sender.replyTo,
        subject: `Votre proforma ${invoice.number} — ${sender.name}`,
        text: `Bonjour ${data.clientCompany || data.clientContact || 'Client'},\n\nVeuillez trouver en pièce jointe votre proforma ${invoice.number}.\n\nTotal TTC : ${money(invoice.amount)}\n\n${sender.name}`,
        html: buildEmailHtml(invoice, sender, pdfFilename),
        attachments: [{ filename: pdfFilename, content: pdf.toString('base64') }]
      })
    });
    const responseText = await response.text();
    let responseData = null;
    try { responseData = responseText ? JSON.parse(responseText) : null; } catch { responseData = null; }
    if (!response.ok) {
      const message = clean(responseData?.message || responseData?.name || 'Le fournisseur e-mail a refusé l’envoi.', 300);
      await saveDelivery(delivery.id, { status: 'failed', error_message: message, sent_at: null });
      res.status(502).json({ ok: false, error: message });
      return;
    }
    await saveDelivery(delivery.id, { status: 'sent', provider_message_id: clean(responseData?.id, 180), error_message: null, sent_at: new Date().toISOString() });
    res.status(201).json({ ok: true, sent: true, messageId: responseData?.id || null, recipient });
  } catch (error) {
    console.error('Proforma e-mail failed:', error instanceof Error ? error.message : error);
    res.status(error.status === 401 ? 401 : 500).json({ ok: false, error: error.status === 401 ? 'Session Supabase expirée.' : 'La proforma existe mais son envoi e-mail a échoué.' });
  }
};
