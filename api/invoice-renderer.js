'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const BRAND_DESIGNS = {
  voom: {
    name: 'Voomstore', edition: 'COMMERCE & TECHNOLOGIE', domain: 'voomstore.ci',
    accent: '#315c9a', kicker: '#46699e', title: '#233e67', titleBg: '#edf3fb',
    tableBg: '#eaf2fa', tableText: '#35547d', rowBorder: '#dfebf5', paymentBg: '#f1f5fb',
    totalBg: 'accent', totalText: '#ffffff', top: 'accent', titleStyle: 'card'
  },
  maginfo: {
    name: 'Magasin Informatique', edition: 'SOLUTIONS INFORMATIQUES', domain: 'magasininformatique.ci',
    accent: '#c72136', kicker: '#e87380', title: '#ffffff', titleBg: '#18283d',
    tableBg: '#26384e', tableText: '#ffffff', rowBorder: '#cfd8e3', paymentBg: '#ffffff',
    totalBg: 'accent', totalText: '#ffffff', top: 'accent', titleStyle: 'dark',
    darkDates: true
  },
  onduleurs: {
    name: 'Onduleurs', edition: 'PROTECTION ÉLECTRIQUE', domain: 'onduleurs.ci',
    accent: '#aa2031', kicker: '#aa2031', title: '#aa2031', titleBg: '#ffffff',
    tableBg: 'accent', tableText: '#ffffff', rowBorder: '#ecdee0', paymentBg: '#fff7f8',
    totalBg: '#ffffff', totalText: 'accent', top: 'accent', titleStyle: 'plain-reverse',
    outlinedTotal: true
  },
  licences: {
    name: 'Licences', edition: 'LOGICIELS & LICENCES', domain: 'licences.ci',
    accent: '#683d92', kicker: '#683d92', title: '#683d92', titleBg: '#f9f5fe',
    tableBg: '#f3eafa', tableText: '#60308b', rowBorder: '#dfd0ed', paymentBg: '#faf6fe',
    totalBg: 'accent', totalText: '#ffffff', top: '#6d3d99', titleStyle: 'card',
    serifTitle: true
  },
  groupes: {
    name: 'Groupes Électrogènes', edition: 'ÉNERGIE & PUISSANCE', domain: 'groupeselectrogenes.ci',
    accent: '#b18c2c', kicker: '#b18c2c', title: '#222b33', titleBg: '#ffffff',
    tableBg: '#282d33', tableText: '#f2d775', rowBorder: '#cfd1d3', paymentBg: '#fbf7eb',
    totalBg: '#282d33', totalText: '#ffffff', top: '#d3a833', titleStyle: 'plain',
    stripedTop: true
  },
  legrand: {
    name: 'Legrand Bâtiment', edition: 'ÉQUIPEMENTS DU BÂTIMENT', domain: 'legrandbatiment.ci',
    accent: '#aa8c59', kicker: '#aa8c59', title: '#313240', titleBg: '#ffffff',
    tableBg: '#ffffff', tableText: '#8d7249', rowBorder: '#c5b393', paymentBg: '#fcfbf8',
    totalBg: '#ffffff', totalText: '#344055', top: '#aa8c59', titleStyle: 'plain',
    serifTitle: true, outlinedTotal: true
  },
  starlink: {
    name: 'Starlink CI', edition: 'CONNECTIVITÉ SATELLITE', domain: 'starlinkci.ci',
    accent: '#111111', kicker: '#555555', title: '#151515', titleBg: '#ffffff',
    tableBg: '#eaeaea', tableText: '#252525', rowBorder: '#d5d5d5', paymentBg: '#f2f2f2',
    totalBg: '#111111', totalText: '#ffffff', top: '#111111', titleStyle: 'plain',
    darkHeader: true
  },
  entreprise: {
    name: 'Entreprise Informatique', edition: 'SERVICES INFORMATIQUES', domain: 'entrepriseinformatique.ci',
    accent: '#d52235', kicker: '#d52235', title: '#d52235', titleBg: '#ffffff',
    tableBg: '#e8f1eb', tableText: '#396149', rowBorder: '#dbe7df', paymentBg: '#ffffff',
    totalBg: '#f2f6f3', totalText: '#283d30', top: 'accent', titleStyle: 'plain-reverse',
    outlinedTotal: true
  },
  cabinetvf: {
    name: 'Cabinet VF', edition: 'FORMATION PROFESSIONNELLE', domain: 'voomnetformation.ci',
    accent: '#5a1b89', kicker: '#5a1b89', title: '#202f42', titleBg: '#ffffff',
    tableBg: '#f3ecf8', tableText: '#5a1b89', rowBorder: '#e1d6e9', paymentBg: '#faf6fe',
    totalBg: 'accent', totalText: '#ffffff', top: 'accent', titleStyle: 'plain'
  }
};

const DEFAULT_LOGO_FILES = {
  voom: path.join(__dirname, 'assets', 'brand-voom.jpg'),
  maginfo: path.join(__dirname, 'assets', 'brand-maginfo.jpg'),
  onduleurs: path.join(__dirname, 'assets', 'brand-onduleurs.jpg'),
  licences: path.join(__dirname, 'assets', 'brand-licences.jpg'),
  groupes: path.join(__dirname, 'assets', 'brand-groupes.jpg'),
  legrand: path.join(__dirname, 'assets', 'brand-legrand.jpg'),
  starlink: path.join(__dirname, 'assets', 'brand-starlink.jpg'),
  entreprise: path.join(__dirname, 'assets', 'brand-entreprise.jpg'),
  cabinetvf: path.join(__dirname, 'assets', 'brand-cabinetvf.png')
};

const DEFAULT_IDENTITIES = {
  voom: { company: 'Voomstore', address: 'Cocody Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 27 22 28 81 88', whatsapp: '+225 07 19 19 19 10', email: 'contact@voomstore.ci' },
  maginfo: { company: 'Magasin Informatique Côte d’Ivoire', address: 'Cocody Angré Star 14, 9e tranche, Bâtiment Voomstore, Abidjan, Côte d’Ivoire', phone: '+225 07 19 19 19 31', whatsapp: '+225 07 19 19 19 31', email: 'contact@magasininformatique.ci' },
  onduleurs: { company: 'Onduleurs.ci', address: 'Cocody Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 05 01 68 34 34', whatsapp: '+225 05 01 68 34 34', email: 'contact@onduleurs.ci' },
  licences: { company: 'LICENCES.CI', address: 'Abidjan, Cocody Angré Star 14, Côte d’Ivoire', phone: '+225 05 01 69 01 01', whatsapp: '+225 05 01 69 01 01', email: 'contact@licences.ci' },
  groupes: { company: 'Groupes électrogènes', address: 'Cocody Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 05 01 68 33 33', whatsapp: '+225 05 01 68 33 33', email: 'contact@groupeselectrogenes.ci' },
  legrand: { company: 'Le Grand Bâtiment', address: 'Cocody Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 27 22 52 25 36', whatsapp: '+225 05 64 24 05 05', email: 'contact@legrandbatiment.ci' },
  starlink: { company: 'Starlinkci', address: 'Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 05 01 65 77 77', whatsapp: '+225 05 01 65 77 77', email: 'contact@starlinkci.ci' },
  entreprise: { company: 'Entreprise informatique', address: 'Angré Star 14, Abidjan, Côte d’Ivoire', phone: '+225 05 01 66 71 71', whatsapp: '', email: 'contact@entrepriseinformatique.ci' },
  cabinetvf: { company: 'Voomnet Formation', address: 'Cocody Angré 9e tranche Star 14 – lot 320, îlot 15, Abidjan, Côte d’Ivoire', phone: '+225 05 01 69 02 02', whatsapp: '+225 05 01 69 02 02', email: 'contact@voomnetformation.ci' }
};

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

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function numberValue(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function money(value) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(numberValue(value))} FCFA`;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function plusDays(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + (Number(days) || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function quantityLabel(row) {
  if (row.unit === 'forfait') return 'Forfait';
  const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(numberValue(row.quantity));
  const units = { u: 'u', m: 'm', m2: 'm²', m3: 'm³', kg: 'kg', h: 'h', jour: 'jour' };
  return `${quantity} ${units[row.unit] || row.unit || 'u'}`;
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
        description: String(item?.description || '').trim(),
        quantity,
        unit: String(item?.unit || 'u'),
        price,
        total: quantity * price
      };
    });
}

function underTwenty(value) {
  return ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'][value];
}

function underHundred(value) {
  if (value < 17) return underTwenty(value);
  if (value < 20) return `dix-${underTwenty(value - 10)}`;
  const tens = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  if (value < 70) {
    const ten = Math.floor(value / 10), unit = value % 10;
    return unit === 0 ? tens[ten] : unit === 1 ? `${tens[ten]} et un` : `${tens[ten]}-${underTwenty(unit)}`;
  }
  if (value < 80) return value === 71 ? 'soixante et onze' : `soixante-${underTwenty(value - 60)}`;
  if (value === 80) return 'quatre-vingts';
  return `quatre-vingt-${underHundred(value - 80)}`;
}

function underThousand(value) {
  if (value < 100) return underHundred(value);
  const hundreds = Math.floor(value / 100), rest = value % 100;
  const prefix = hundreds === 1 ? 'cent' : `${underHundred(hundreds)} cent`;
  return rest ? `${prefix} ${underHundred(rest)}` : `${prefix}${hundreds > 1 ? 's' : ''}`;
}

function integerWords(value) {
  let number = Math.max(0, Math.floor(numberValue(value)));
  if (!number) return 'zéro';
  const scales = ['', 'mille', 'million', 'milliard', 'billion'];
  const parts = [];
  let index = 0;
  while (number) {
    const group = number % 1000;
    if (group) {
      if (index === 0) parts.unshift(underThousand(group));
      else if (index === 1) parts.unshift(`${group === 1 ? '' : `${underThousand(group)} `}mille`);
      else parts.unshift(`${underThousand(group)} ${scales[index] || `10 puissance ${index * 3}`}${group > 1 ? 's' : ''}`);
    }
    number = Math.floor(number / 1000);
    index += 1;
  }
  return parts.join(' ');
}

function amountInWords(value) {
  const amount = Math.round(numberValue(value));
  return `${integerWords(amount)} ${amount === 1 ? 'franc CFA' : 'francs CFA'}`;
}

function parseDataLogo(value) {
  const match = /^data:image\/(png|jpeg|jpg);base64,([a-zA-Z0-9+/=]+)$/.exec(String(value || '').trim());
  if (!match) return null;
  return {
    buffer: Buffer.from(match[2], 'base64'),
    mime: match[1] === 'png' ? 'image/png' : 'image/jpeg',
    extension: match[1] === 'png' ? 'png' : 'jpg',
    custom: true
  };
}

function logoAssetForInvoice(invoice) {
  const profile = invoice?.profile_snapshot && typeof invoice.profile_snapshot === 'object' ? invoice.profile_snapshot : {};
  const custom = parseDataLogo(profile.logo);
  if (custom) return custom;
  const brandId = String(invoice?.brand_id || '');
  const file = DEFAULT_LOGO_FILES[brandId];
  if (!file || !fs.existsSync(file)) return null;
  const extension = path.extname(file).slice(1).toLowerCase();
  return {
    buffer: fs.readFileSync(file),
    mime: extension === 'png' ? 'image/png' : 'image/jpeg',
    extension: extension === 'png' ? 'png' : 'jpg',
    custom: false
  };
}

function renderContext(invoice) {
  const data = invoice?.data && typeof invoice.data === 'object' ? invoice.data : {};
  const storedProfile = invoice?.profile_snapshot && typeof invoice.profile_snapshot === 'object' ? invoice.profile_snapshot : {};
  const brandId = String(invoice?.brand_id || '');
  const design = BRAND_DESIGNS[brandId] || BRAND_DESIGNS.voom;
  const profile = { ...(DEFAULT_IDENTITIES[brandId] || {}), ...storedProfile };
  const accent = brandId === 'starlink' ? '#111111' : validColor(profile.color) ? String(profile.color).trim() : design.accent;
  const isFinal = Boolean(invoice?.proforma_id);
  const company = clean(profile.company || design.name, 180);
  const client = clean(data.mode === 'turbo' ? (data.turboClient || data.clientCompany || data.clientContact) : (data.clientCompany || data.clientContact), 220) || 'Client';
  const paymentDue = data.paymentDue === 'at_order' ? 'À la commande' : data.paymentDue ? formatDate(data.paymentDue) : '';
  const logo = logoAssetForInvoice(invoice);
  return { data, profile, brandId, design, accent, isFinal, company, client, paymentDue, logo, brandName: design.name };
}

function drawLogo(document, logo, x, y, width, height) {
  if (!logo) return false;
  try {
    document.image(logo.buffer, x, y, { fit: [width, height], align: 'left', valign: 'center' });
    return true;
  } catch (error) {
    console.warn('Logo de facture impossible à intégrer au PDF', error?.message || error);
    return false;
  }
}

function drawWrapped(document, value, x, y, width, options = {}) {
  const text = pdfText(value || '');
  if (!text) return 0;
  const lineGap = options.lineGap ?? 2;
  const fontSize = options.fontSize || 9;
  document.font(options.font || 'Helvetica').fontSize(fontSize).fillColor(options.color || '#637286');
  document.text(text, x, y, { width, lineGap, align: options.align || 'left' });
  return document.heightOfString(text, { width, lineGap });
}

function safeY(document, y, needed, startNewPage) {
  if (y + needed <= 748) return y;
  document.addPage();
  startNewPage();
  return 50;
}

function drawPdfTableHeader(document, context, y, x = 42, width = 511) {
  const { design, accent } = context;
  const background = design.tableBg === 'accent' ? accent : design.tableBg;
  const textColor = design.tableText === 'accent' ? accent : design.tableText;
  document.fillColor(background).rect(x, y, width, 27).fill();
  document.fillColor(textColor).font('Helvetica-Bold').fontSize(8);
  document.text('RÉF.', x + 9, y + 9, { width: 48 });
  document.text('DÉSIGNATION', x + 67, y + 9, { width: 185 });
  document.text('QTÉ / UNITÉ', x + 270, y + 9, { width: 68, align: 'right' });
  document.text('PU HT', x + 347, y + 9, { width: 68, align: 'right' });
  document.text('MONTANT HT', x + 426, y + 9, { width: 76, align: 'right' });
  return y + 27;
}

function drawPdfDocument(invoice, sender) {
  return new Promise((resolve, reject) => {
    const context = renderContext(invoice);
    const { data, profile, design, accent, isFinal, company, client, paymentDue } = context;
    const rows = itemRows(data);
    const document = new PDFDocument({ size: 'A4', margin: 42, info: {
      Title: `${isFinal ? 'Facture' : 'Proforma'} ${invoice.number}`,
      Author: company || sender.name,
      Subject: isFinal ? 'Facture définitive' : 'Facture proforma'
    }});
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const pageWidth = 595;
    const left = 42;
    const contentWidth = 511;
    const right = left + contentWidth;
    const domain = design.domain;
    const companyDetails = [profile.address, profile.phone ? `Tél. : ${profile.phone}` : '', profile.whatsapp ? `WhatsApp : ${profile.whatsapp}` : '', profile.email].filter(Boolean).join(' · ');
    const clientDetails = [data.clientContact, data.clientAddress, data.clientPhone, data.clientEmail].filter(Boolean).join('\n');
    const bankInfo = [profile.rib, profile.bic ? `BIC : ${profile.bic}` : '', profile.iban ? `IBAN : ${profile.iban}` : ''].filter(Boolean).join('\n');
    const title = isFinal ? 'FACTURE' : 'FACTURE PROFORMA';
    const issueDate = formatDate(invoice.issue_date || data.date);
    const validUntil = formatDate(plusDays(invoice.issue_date || data.date, data.validDays || 15));
    const titleColor = ['onduleurs', 'licences', 'entreprise'].includes(context.brandId) ? accent : design.title;
    const kickerColor = ['onduleurs', 'licences', 'groupes', 'legrand', 'entreprise'].includes(context.brandId) ? accent : design.kicker;
    const totalBackground = design.totalBg === 'accent' ? accent : design.totalBg;
    const totalText = design.totalText === 'accent' ? accent : design.totalText;

    const drawPageHeader = () => {
      if (design.darkHeader) {
        document.fillColor('#0b0b0b').rect(0, 0, pageWidth, 154).fill();
        document.fillColor('#ffffff');
      }
      const band = design.stripedTop ? null : (design.top === 'accent' ? accent : design.top);
      if (band) document.fillColor(band).rect(0, 0, pageWidth, design.darkHeader ? 5 : 6).fill();
      if (design.stripedTop) {
        document.fillColor('#272b30').rect(0, 0, pageWidth, 10).fill();
        document.fillColor('#e3b936').rect(0, 0, pageWidth, 5).fill();
      }
      const logoY = design.darkHeader ? 32 : 28;
      const logoWidth = context.logo?.custom ? 235 : 215;
      const logoHeight = context.brandId === 'maginfo' || context.brandId === 'entreprise' ? 106 : 76;
      const squareLogo = !context.logo?.custom && ['maginfo', 'entreprise'].includes(context.brandId);
      if (squareLogo) drawLogo(document, context.logo, left, logoY, 100, 100);
      else drawLogo(document, context.logo, left, logoY, logoWidth, logoHeight);
      const wordmarkX = squareLogo ? left + 112 : left;
      const wordmarkY = squareLogo ? logoY + 29 : logoY + logoHeight + 6;
      document.fillColor(design.darkHeader ? '#ffffff' : '#202f42').font('Helvetica-Bold').fontSize(squareLogo ? 15 : 12).text(pdfText(design.name), wordmarkX, wordmarkY, { width: 235 });
      document.fillColor(design.darkHeader ? '#d3d3d3' : '#8491a2').font('Helvetica').fontSize(8.5).text(pdfText(domain), wordmarkX, wordmarkY + 17, { width: 235 });
      document.fillColor(design.darkHeader ? '#ffffff' : '#2c3c50').font('Helvetica-Bold').fontSize(9.5).text(pdfText(company), 360, logoY + 3, { width: 193, align: 'right' });
      drawWrapped(document, companyDetails, 330, logoY + 22, 223, { align: 'right', color: design.darkHeader ? '#d3d3d3' : '#657487', fontSize: 8.2, lineGap: 2 });
      return design.darkHeader ? 178 : Math.max(137, wordmarkY + 34);
    };

    let y = drawPageHeader();
    document.fillColor('#8c9aac').font('Helvetica-Bold').fontSize(7.5).text(pdfText(design.edition), left, y, { width: 330, characterSpacing: 0.7 });
    document.text(pdfText(`${String(invoice.brand_id || '').toUpperCase()} · CÔTE D’IVOIRE`), 360, y, { width: 193, align: 'right', characterSpacing: 0.4 });
    y += 22;

    const titleHeight = design.titleStyle === 'card' || design.titleStyle === 'dark' ? 76 : 62;
    if (design.titleStyle === 'dark') {
      document.fillColor(design.titleBg).rect(left, y, contentWidth, titleHeight).fill();
    } else if (design.titleStyle === 'card') {
      document.fillColor(design.titleBg).roundedRect(left, y, contentWidth, titleHeight, 10).fill();
    } else {
      document.strokeColor(design.rowBorder).lineWidth(design.titleStyle === 'plain-reverse' ? 0 : 1).moveTo(left, y + titleHeight).lineTo(right, y + titleHeight).stroke();
    }
    const titleX = design.titleStyle === 'plain-reverse' ? left + 270 : left + 17;
    const dateX = design.titleStyle === 'plain-reverse' ? left : 365;
    document.fillColor(design.titleStyle === 'dark' ? '#e87380' : kickerColor).font('Helvetica-Bold').fontSize(8).text('DOCUMENT COMMERCIAL', titleX, y + 14, { width: 250, characterSpacing: 0.8, align: design.titleStyle === 'plain-reverse' ? 'right' : 'left' });
    document.fillColor(titleColor).font(design.serifTitle ? 'Times-Bold' : 'Helvetica-Bold').fontSize(design.titleStyle === 'dark' ? 24 : 25).text(pdfText(title), titleX, y + 27, { width: 250, align: design.titleStyle === 'plain-reverse' ? 'right' : 'left' });
    if (data.invoiceTitle) document.fillColor(accent).font('Helvetica-Bold').fontSize(9.5).text(pdfText(data.invoiceTitle), titleX, y + 57, { width: 250, align: design.titleStyle === 'plain-reverse' ? 'right' : 'left' });
    document.fillColor(design.titleStyle === 'dark' ? '#d9e2ec' : '#7d8b9c').font('Helvetica').fontSize(8.5).text(pdfText(invoice.number), dateX, y + 27, { width: 188, align: 'right' });
    document.text(`Émise le ${pdfText(issueDate)}`, dateX, y + 41, { width: 188, align: 'right' });
    document.text(`Valable jusqu’au ${pdfText(validUntil)}`, dateX, y + 53, { width: 188, align: 'right' });
    y += titleHeight + 24;

    const addressTop = y;
    document.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text('ÉMETTEUR', left, addressTop, { characterSpacing: 0.9 });
    document.fillColor('#29394d').font('Helvetica-Bold').fontSize(10).text(pdfText(company), left, addressTop + 16, { width: 235 });
    drawWrapped(document, [profile.address || 'Adresse à renseigner', profile.phone, profile.email].filter(Boolean).join('\n'), left, addressTop + 32, 235, { fontSize: 8.5, lineGap: 2 });
    document.strokeColor('#e9edf2').lineWidth(1).moveTo(298, addressTop - 2).lineTo(298, addressTop + 76).stroke();
    document.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text('DESTINATAIRE', 325, addressTop, { characterSpacing: 0.9 });
    document.fillColor('#29394d').font('Helvetica-Bold').fontSize(10).text(pdfText(client), 325, addressTop + 16, { width: 228 });
    drawWrapped(document, clientDetails || 'Informations complémentaires à renseigner', 325, addressTop + 32, 228, { fontSize: 8.5, lineGap: 2 });
    y = addressTop + 96;

    const meta = [
      ['Lieu d’émission', data.issuePlace], ['Référence dossier', data.docRef], ['Livraison prévue', formatDate(data.deliveryDate)],
      [data.paymentDue === 'at_order' ? 'Condition de règlement' : 'Règlement au plus tard', paymentDue], ['Mode de règlement', data.paymentMethod]
    ].filter(([, value]) => String(value || '').trim());
    if (meta.length) {
      const boxWidth = (contentWidth - 14) / Math.min(3, meta.length);
      meta.forEach(([label, value], index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const boxX = left + column * (boxWidth + 7);
        const boxY = y + row * 38;
        document.fillColor('#f7f9fb').roundedRect(boxX, boxY, boxWidth, 31, 4).fill();
        document.fillColor('#8493a5').font('Helvetica-Bold').fontSize(6.5).text(pdfText(label).toUpperCase(), boxX + 8, boxY + 7, { width: boxWidth - 16 });
        document.fillColor('#27394d').font('Helvetica-Bold').fontSize(8).text(pdfText(value), boxX + 8, boxY + 17, { width: boxWidth - 16 });
      });
      y += Math.ceil(meta.length / 3) * 38 + 12;
    }

    document.fillColor('#97a4b1').font('Helvetica').fontSize(7.5).text('Montants en francs CFA · FCFA', left, y, { width: contentWidth, align: 'right' });
    y += 8;
    y = drawPdfTableHeader(document, context, y);
    const tableHeaderY = y - 27;
    const drawTableHeaderOnNewPage = () => { y = drawPageHeader(); y += 25; y = drawPdfTableHeader(document, context, y); };
    if (!rows.length) rows.push({ reference: '', designation: 'Vos articles apparaîtront ici…', description: '', quantity: 0, unit: 'u', price: 0, total: 0 });
    rows.forEach((row, index) => {
      const description = [row.reference, row.designation, row.description].filter(Boolean).join(' · ');
      const rowHeight = Math.max(28, Math.min(74, document.heightOfString(pdfText(description), { width: 175, font: 'Helvetica', size: 8.5 }) + 15));
      if (y + rowHeight > 715) {
        document.addPage();
        drawTableHeaderOnNewPage();
      }
      const fill = index % 2 ? '#ffffff' : '#fbfcfd';
      document.fillColor(fill).rect(left, y, contentWidth, rowHeight).fill();
      document.strokeColor(design.rowBorder).lineWidth(0.6).moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).stroke();
      document.fillColor('#8290a0').font('Helvetica').fontSize(8).text(pdfText(row.reference || '—'), left + 9, y + 9, { width: 48 });
      document.fillColor('#304157').font('Helvetica-Bold').fontSize(8.5).text(pdfText(row.designation || '—'), left + 67, y + 8, { width: 175 });
      if (row.description) document.fillColor('#718095').font('Helvetica').fontSize(7.5).text(pdfText(row.description), left + 67, y + 23, { width: 175 });
      document.fillColor('#304157').font('Helvetica').fontSize(8).text(pdfText(quantityLabel(row)), left + 270, y + 9, { width: 68, align: 'right' });
      document.text(money(row.price), left + 347, y + 9, { width: 68, align: 'right' });
      document.font('Helvetica-Bold').text(money(row.total), left + 426, y + 9, { width: 76, align: 'right' });
      y += rowHeight;
    });

    const amount = numberValue(invoice.amount);
    const vatRate = numberValue(data.vatRate) === 18 ? 18 : 0;
    const ht = vatRate ? Math.round(amount / 1.18) : amount;
    const vat = amount - ht;
    y += 18;
    if (y > 690) { document.addPage(); y = drawPageHeader() + 30; }
    const totalX = 346;
    document.fillColor('#758396').font('Helvetica').fontSize(8.5).text('Sous-total HT', totalX, y, { width: 110 });
    document.fillColor('#344457').font('Helvetica-Bold').text(money(ht), 465, y, { width: 78, align: 'right' });
    y += 16;
    document.fillColor('#758396').font('Helvetica').text(`TVA ${vatRate} %`, totalX, y, { width: 110 });
    document.fillColor('#344457').font('Helvetica-Bold').text(money(vat), 465, y, { width: 78, align: 'right' });
    y += 18;
    if (design.outlinedTotal) {
      document.strokeColor(totalBackground).lineWidth(1.5).roundedRect(totalX, y, 207, 39, 5).stroke();
      document.fillColor(totalText).font('Helvetica-Bold').fontSize(9).text('À PAYER', totalX + 12, y + 14, { width: 70 });
      document.fontSize(13).text(money(amount), totalX + 78, y + 12, { width: 117, align: 'right' });
    } else {
      document.fillColor(totalBackground).roundedRect(totalX, y, 207, 39, design.titleStyle === 'dark' ? 0 : 7).fill();
      document.fillColor(totalText).font('Helvetica-Bold').fontSize(9).text('À PAYER', totalX + 12, y + 14, { width: 70 });
      document.fontSize(13).text(money(amount), totalX + 78, y + 12, { width: 117, align: 'right' });
    }
    y += 51;
    document.fillColor('#637286').font('Helvetica').fontSize(7.5).text(pdfText(amountInWords(amount)), totalX, y, { width: 207, align: 'center' });
    y += 25;

    if (data.deliveryTerms) { drawWrapped(document, `Livraison / exécution : ${data.deliveryTerms}`, left, y, contentWidth, { fontSize: 8, lineGap: 2 }); y += 25; }
    if (data.note) { drawWrapped(document, `Conditions particulières : ${data.note}`, left, y, contentWidth, { fontSize: 8, lineGap: 2 }); y += 32; }
    if (y > 748) { document.addPage(); y = 50; }
    document.fillColor(design.paymentBg).roundedRect(left, y, contentWidth, 56, 5).fill();
    document.fillColor(accent).rect(left, y, 4, 56).fill();
    document.fillColor('#8493a5').font('Helvetica-Bold').fontSize(7.5).text('VIREMENT BANCAIRE · RIB / IBAN', left + 14, y + 11, { characterSpacing: 0.5 });
    drawWrapped(document, bankInfo || 'Coordonnées bancaires à renseigner', left + 14, y + 25, contentWidth - 28, { fontSize: 8, color: '#44546a', lineGap: 1.5 });
    y += 72;
    document.strokeColor('#e7ecf1').lineWidth(0.8).moveTo(left, y).lineTo(right, y).stroke();
    document.fillColor('#8a98a7').font('Helvetica-Bold').fontSize(6.8).text('NOM DU VENDEUR', left, y + 11, { width: contentWidth, align: 'center', characterSpacing: 0.5 });
    document.fillColor('#2d3e52').font('Helvetica-Bold').fontSize(8.5).text(pdfText(profile.preparedBy || sender.name), left, y + 22, { width: contentWidth, align: 'center' });
    document.fillColor('#8a98a7').font('Helvetica').fontSize(7.5).text(pdfText(`${company} · ${profile.phone || sender.email}`), left, y + 37, { width: contentWidth, align: 'center' });
    document.end();
  });
}

function inlineStyle(context) {
  const { design, accent } = context;
  const titleBg = design.titleBg === 'accent' ? accent : design.titleBg;
  const tableBg = design.tableBg === 'accent' ? accent : design.tableBg;
  const tableText = design.tableText === 'accent' ? accent : design.tableText;
  const totalBg = design.totalBg === 'accent' ? accent : design.totalBg;
  const totalText = design.totalText === 'accent' ? '#ffffff' : design.totalText;
  return { titleBg, tableBg, tableText, totalBg, totalText };
}

function buildInvoiceEmailHtml(invoice, sender, pdfFilename, options = {}) {
  const context = renderContext(invoice);
  const { data, profile, design, accent, isFinal, company, client, paymentDue } = context;
  const styles = inlineStyle(context);
  const titleColor = ['onduleurs', 'licences', 'entreprise'].includes(context.brandId) ? accent : design.title;
  const kickerColor = ['onduleurs', 'licences', 'groupes', 'legrand', 'entreprise'].includes(context.brandId) ? accent : design.kicker;
  const rows = itemRows(data);
  const logo = options.logoCid ? `<img src="cid:${htmlEscape(options.logoCid)}" alt="Logo ${htmlEscape(design.name)}" style="display:block;max-width:250px;max-height:92px;width:auto;height:auto;object-fit:contain">` : '';
  const rowHtml = rows.length ? rows.map(row => `<tr><td style="padding:12px 8px;border-bottom:1px solid ${design.rowBorder};color:#8290a0;font-size:12px">${htmlEscape(row.reference || '—')}</td><td style="padding:12px 8px;border-bottom:1px solid ${design.rowBorder};color:#304157;font-size:12px"><strong>${htmlEscape(row.designation)}</strong>${row.description ? `<br><small style="color:#718095">${htmlEscape(row.description)}</small>` : ''}</td><td style="padding:12px 8px;border-bottom:1px solid ${design.rowBorder};text-align:right;color:#304157;font-size:12px">${htmlEscape(quantityLabel(row))}</td><td style="padding:12px 8px;border-bottom:1px solid ${design.rowBorder};text-align:right;color:#304157;font-size:12px">${htmlEscape(money(row.price))}</td><td style="padding:12px 8px;border-bottom:1px solid ${design.rowBorder};text-align:right;color:#304157;font-size:12px"><strong>${htmlEscape(money(row.total))}</strong></td></tr>`).join('') : '<tr><td colspan="5" style="padding:14px;color:#aab4c1">Aucun article renseigné.</td></tr>';
  const amount = numberValue(invoice.amount);
  const vatRate = numberValue(data.vatRate) === 18 ? 18 : 0;
  const ht = vatRate ? Math.round(amount / 1.18) : amount;
  const vat = amount - ht;
  const companyDetails = [profile.address, profile.phone ? `Tél. : ${profile.phone}` : '', profile.whatsapp ? `WhatsApp : ${profile.whatsapp}` : '', profile.email].filter(Boolean).join(' · ');
  const clientDetails = [data.clientContact, data.clientAddress, data.clientPhone, data.clientEmail].filter(Boolean).map(htmlEscape).join('<br>');
  const bankInfo = [profile.rib, profile.bic ? `BIC : ${profile.bic}` : '', profile.iban ? `IBAN : ${profile.iban}` : ''].filter(Boolean).map(htmlEscape).join('<br>');
  const meta = [
    ['Lieu d’émission', data.issuePlace], ['Référence dossier', data.docRef], ['Livraison prévue', formatDate(data.deliveryDate)],
    [data.paymentDue === 'at_order' ? 'Condition de règlement' : 'Règlement au plus tard', paymentDue], ['Mode de règlement', data.paymentMethod]
  ].filter(([, value]) => String(value || '').trim());
  const metadata = meta.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px">${meta.map(([label, value]) => `<div style="flex:1 1 30%;min-width:145px;background:#f7f9fb;border-radius:6px;padding:9px 10px"><span style="display:block;color:#8493a5;font-size:9px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">${htmlEscape(label)}</span><strong style="display:block;margin-top:4px;color:#27394d;font-size:11px">${htmlEscape(value)}</strong></div>`).join('')}</div>` : '';
  const title = isFinal ? 'Facture' : 'Facture proforma';
  const issueDate = formatDate(invoice.issue_date || data.date);
  const validUntil = formatDate(plusDays(invoice.issue_date || data.date, data.validDays || 15));
  const titleRow = design.titleStyle === 'dark' ? `background:${styles.titleBg};color:#fff` : `background:${styles.titleBg};border:1px solid ${design.rowBorder}`;
  const logoBlock = logo ? `<div style="margin-bottom:8px">${logo}</div>` : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#e9edf2;color:#27384c;font-family:Arial,Helvetica,sans-serif"><div style="max-width:820px;margin:22px auto;background:#fff;border:1px solid #e0e6ed;box-shadow:0 8px 28px rgba(36,52,73,.12)"><div style="height:6px;background:${design.top === 'accent' ? accent : design.top}"></div><div style="padding:26px 32px 34px">${logoBlock}<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:top;width:58%"><div style="font-size:16px;font-weight:bold;color:${design.darkHeader ? '#111111' : '#202f42'}">${htmlEscape(design.name)}</div><div style="margin-top:4px;color:#8491a2;font-size:11px">${htmlEscape(design.domain)}</div></td><td style="vertical-align:top;text-align:right;color:#657487;font-size:11px;line-height:1.6"><strong style="color:#2c3c50">${htmlEscape(company)}</strong><br>${htmlEscape(companyDetails)}</td></tr></table><div style="display:flex;justify-content:space-between;margin:20px 0 8px;color:#8c9aac;font-size:9px;font-weight:bold;letter-spacing:.1em"><span>${htmlEscape(design.edition)}</span><span>${htmlEscape(String(invoice.brand_id || '').toUpperCase())} · CÔTE D’IVOIRE</span></div><div style="${titleRow};border-radius:${design.titleStyle === 'dark' ? '0' : '12px'};padding:20px 22px;margin:0 0 24px"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:bottom"><div style="color:${design.titleStyle === 'dark' ? '#e87380' : kickerColor};font-size:10px;font-weight:bold;letter-spacing:.13em;text-transform:uppercase">Document commercial</div><h1 style="margin:5px 0 0;color:${design.titleStyle === 'dark' ? '#fff' : titleColor};font-size:${design.serifTitle ? '30px' : '28px'};line-height:1.1">${title}</h1>${data.invoiceTitle ? `<div style="margin-top:7px;color:${accent};font-size:14px;font-weight:bold">${htmlEscape(data.invoiceTitle)}</div>` : ''}</td><td style="vertical-align:bottom;text-align:right;color:${design.titleStyle === 'dark' ? '#d9e2ec' : '#7d8b9c'};font-size:11px;line-height:1.7">${htmlEscape(invoice.number)}<br>Émise le ${htmlEscape(issueDate)}<br>Valable jusqu’au ${htmlEscape(validUntil)}</td></tr></table></div><table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px"><tr><td style="vertical-align:top;width:50%;padding-right:18px"><div style="color:#9aa7b5;font-size:10px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase">Émetteur</div><div style="margin-top:7px;color:#29394d;font-size:14px;font-weight:bold">${htmlEscape(company)}</div><div style="margin-top:4px;color:#637286;font-size:11px;line-height:1.6">${htmlEscape([profile.address, profile.phone, profile.email].filter(Boolean).join('\n')).replace(/\n/g, '<br>')}</div></td><td style="vertical-align:top;width:50%;border-left:1px solid #e9edf2;padding-left:18px"><div style="color:#9aa7b5;font-size:10px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase">Destinataire</div><div style="margin-top:7px;color:#29394d;font-size:14px;font-weight:bold">${htmlEscape(client)}</div><div style="margin-top:4px;color:#637286;font-size:11px;line-height:1.6">${clientDetails || 'Informations complémentaires à renseigner'}</div></td></tr></table>${metadata}<div style="margin:0 0 6px;color:#97a4b1;font-size:10px;text-align:right">Montants en francs CFA · FCFA</div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:${styles.tableBg};color:${styles.tableText}"><th style="padding:11px 8px;text-align:left;font-size:10px">Réf.</th><th style="padding:11px 8px;text-align:left;font-size:10px">Désignation</th><th style="padding:11px 8px;text-align:right;font-size:10px">Qté / unité</th><th style="padding:11px 8px;text-align:right;font-size:10px">PU HT</th><th style="padding:11px 8px;text-align:right;font-size:10px">Montant HT</th></tr></thead><tbody>${rowHtml}</tbody></table><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px"><tr><td></td><td style="width:270px;color:#758396;font-size:11px;line-height:1.9;text-align:left">Sous-total HT <strong style="float:right;color:#344457">${htmlEscape(money(ht))}</strong><br>TVA ${vatRate} % <strong style="float:right;color:#344457">${htmlEscape(money(vat))}</strong><div style="margin-top:8px;padding:13px 14px;background:${styles.totalBg};color:${styles.totalText};border:${design.outlinedTotal ? `1px solid ${accent}` : '0'};border-radius:${design.outlinedTotal ? '0' : '7px'};font-size:13px;font-weight:bold">À payer <span style="float:right">${htmlEscape(money(amount))}</span><div style="clear:both;margin-top:7px;padding-top:7px;border-top:1px solid rgba(128,128,128,.35);font-size:9px;font-weight:normal;text-align:center">${htmlEscape(amountInWords(amount))}</div></div></td></tr></table>${data.deliveryTerms ? `<p style="margin:26px 0 0;color:#69798b;font-size:11px;line-height:1.5"><strong>Livraison / exécution :</strong> ${htmlEscape(data.deliveryTerms)}</p>` : ''}${data.note ? `<p style="margin:10px 0 0;color:#69798b;font-size:11px;line-height:1.5;white-space:pre-line"><strong>Conditions particulières :</strong> ${htmlEscape(data.note)}</p>` : ''}<div style="margin-top:25px;padding:14px 16px;background:${design.paymentBg};border-left:4px solid ${accent};color:#44546a;font-size:10px;line-height:1.5"><strong style="display:block;margin-bottom:4px;color:#8493a5;font-size:9px;letter-spacing:.08em">VIREMENT BANCAIRE · RIB / IBAN</strong>${bankInfo || 'Coordonnées bancaires à renseigner'}</div><div style="margin-top:22px;padding-top:13px;border-top:1px solid #e7ecf1;text-align:center;color:#66778a;font-size:10px;line-height:1.5"><strong style="display:block;color:#2d3e52">${htmlEscape(profile.preparedBy || sender.name)}</strong>${htmlEscape(company)} · ${htmlEscape(profile.phone || sender.email)}<br><span style="color:#9aa6b3;font-size:10px">Document PDF joint : ${htmlEscape(pdfFilename)}</span></div></div></div></body></html>`;
}

module.exports = {
  BRAND_DESIGNS,
  buildPdf: drawPdfDocument,
  buildEmailHtml: buildInvoiceEmailHtml,
  logoAssetForInvoice,
  itemRows,
  money
};
