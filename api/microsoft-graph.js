'use strict';

// Microsoft Graph mail provider. This module is server-only: never import it from
// index.html and never expose its tenant, client secret or access token to a browser.
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

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

function graphConfig() {
  return {
    tenantId: clean(process.env.MS_TENANT_ID, 180),
    clientId: clean(process.env.MS_CLIENT_ID, 180),
    clientSecret: String(process.env.MS_CLIENT_SECRET || '').trim()
  };
}

function graphConfigured() {
  const { tenantId, clientId, clientSecret } = graphConfig();
  return Boolean(tenantId && clientId && clientSecret);
}

function senderFor(brandId) {
  const key = BRAND_ENV_KEYS[brandId];
  if (!key) throw new Error('Marque de facturation inconnue.');
  const email = clean(process.env[`MS_MAILBOX_${key}`], 180).toLowerCase();
  const replyTo = clean(process.env[`MS_REPLY_TO_${key}`] || email, 180).toLowerCase();
  if (!email || !validEmail(email)) throw new Error(`Boîte Microsoft 365 non configurée ou invalide pour ${BRAND_NAMES[brandId]}.`);
  if (!validEmail(replyTo)) throw new Error(`Adresse de réponse absente ou invalide pour ${BRAND_NAMES[brandId]}.`);
  const name = clean(process.env[`MS_FROM_NAME_${key}`] || BRAND_NAMES[brandId], 120);
  return { email, replyTo, name };
}

let cachedToken = null;
let tokenRequest = null;

async function getGraphToken() {
  const { tenantId, clientId, clientSecret } = graphConfig();
  if (!tenantId || !clientId || !clientSecret) {
    const error = new Error('La configuration Microsoft Graph serveur est incomplète.');
    error.code = 'GRAPH_CONFIG_MISSING';
    throw error;
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.accessToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
      })
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok || !data?.access_token) {
      const detail = clean(data?.error_description || data?.error || '', 300);
      const error = new Error(detail || 'Microsoft Graph n’a pas fourni de jeton d’accès.');
      error.status = response.status || 502;
      throw error;
    }
    cachedToken = {
      accessToken: String(data.access_token),
      expiresAt: now + Math.max(60, Number(data.expires_in) || 3600) * 1000
    };
    return cachedToken.accessToken;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

function graphError(response, data) {
  const detail = clean(data?.error?.message || data?.error?.code || data?.message || '', 300);
  const error = new Error(detail || `Microsoft Graph a refusé l’envoi (HTTP ${response.status}).`);
  error.status = response.status || 502;
  error.provider = 'microsoft-graph';
  return error;
}

async function sendGraphMail({ sender, to, cc = [], subject, text, html, attachments = [] }) {
  const token = await getGraphToken();
  const recipients = values => values.filter(validEmail).map(address => ({ emailAddress: { address } }));
  const graphAttachments = attachments.map(attachment => {
    const contentBytes = String(attachment.contentBytes || '');
    const estimatedBytes = Math.floor(contentBytes.length * 3 / 4);
    if (estimatedBytes > 3 * 1024 * 1024) {
      const error = new Error('Le PDF dépasse la limite de 3 Mo pour une pièce jointe Microsoft Graph directe.');
      error.status = 422;
      throw error;
    }
    const graphAttachment = {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: clean(attachment.name, 180),
      contentType: clean(attachment.contentType || 'application/pdf', 120),
      contentBytes
    };
    if (attachment.isInline) {
      graphAttachment.isInline = true;
      graphAttachment.contentId = clean(attachment.contentId || attachment.name, 180);
    }
    return graphAttachment;
  });
  const hasHtml = Boolean(String(html || '').trim());
  const message = {
    subject: clean(subject, 250),
    body: { contentType: hasHtml ? 'HTML' : 'Text', content: String(hasHtml ? html : (text || '')) },
    toRecipients: recipients(to),
    ccRecipients: recipients(cc),
    replyTo: recipients([sender.replyTo]),
    attachments: graphAttachments
  };
  if (!message.toRecipients.length) {
    const error = new Error('Aucun destinataire e-mail valide.');
    error.status = 422;
    throw error;
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender.email)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true })
  });
  const textResponse = await response.text();
  let data = null;
  try { data = textResponse ? JSON.parse(textResponse) : null; } catch { data = null; }
  if (!response.ok) throw graphError(response, data);
  return { status: response.status, messageId: data?.id || null };
}

module.exports = {
  BRAND_NAMES,
  graphConfigured,
  senderFor,
  sendGraphMail
};
