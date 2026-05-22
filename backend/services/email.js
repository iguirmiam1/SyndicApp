const nodemailer = require('nodemailer');

// ── Transporter ───────────────────────────────────────────────────────────────
const createTransporter = () => nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"SyndicPro" <${process.env.SMTP_USER}>`;

// ── Template de base ──────────────────────────────────────────────────────────
const baseTemplate = (content, title) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr><td style="background:#0d5c47;border-radius:12px 12px 0 0;padding:28px 36px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#fff">Syndic</span>
                <span style="font-family:Georgia,serif;font-size:26px;font-style:italic;font-weight:300;color:rgba(255,255,255,.75)">Pro</span>
              </td>
              <td align="right" style="color:rgba(255,255,255,.6);font-size:12px">Gestion de copropriété</td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:36px;border-left:1px solid #e2e0d8;border-right:1px solid #e2e0d8">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f0efe9;border-radius:0 0 12px 12px;border:1px solid #e2e0d8;border-top:none;padding:20px 36px">
          <p style="margin:0;font-size:12px;color:#9a9590;text-align:center">
            Ce message a été envoyé automatiquement par SyndicPro.<br>
            Merci de ne pas répondre directement à cet email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (text, url) => `
  <div style="text-align:center;margin:28px 0">
    <a href="${url}" style="display:inline-block;background:#0d5c47;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:15px">${text}</a>
  </div>`;

const pill = (text, color='#0d5c47') => `<span style="display:inline-block;background:${color}18;color:${color};border:1px solid ${color}40;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600">${text}</span>`;

const infoBox = (rows) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;border-radius:8px;margin:20px 0">
    ${rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e0d8;font-size:13px;color:#9a9590;width:40%">${label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e0d8;font-size:13px;color:#1a1917;font-weight:600">${value}</td>
    </tr>`).join('')}
  </table>`;

// ── Templates emails ──────────────────────────────────────────────────────────

const templates = {

  // 1. Appel de fonds
  appelFonds: ({ prenom, nom, periode, montant, echeance, residenceNom, appUrl }) => ({
    subject: `📋 Appel de fonds ${periode} — ${montant} MAD`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px">Appel de fonds ${periode}</h2>
      <p style="margin:0 0 24px;color:#5a5750">Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p style="color:#5a5750;margin:0 0 20px">Un nouvel appel de fonds a été émis pour la résidence <strong>${residenceNom}</strong>.</p>
      ${infoBox([
        ['Résidence', residenceNom],
        ['Période', periode],
        ['Montant dû', `<span style="color:#0d5c47;font-size:16px">${montant} MAD</span>`],
        ['Échéance', echeance],
      ])}
      <div style="background:#fef8ec;border-left:4px solid #b06b10;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0">
        <p style="margin:0;font-size:13px;color:#b06b10">⚠️ Merci de procéder au règlement avant le <strong>${echeance}</strong> pour éviter des pénalités de retard.</p>
      </div>
      ${btn('💳 Payer en ligne', appUrl + '/finances')}`,
      `Appel de fonds ${periode}`)
  }),

  // 2. Rappel de paiement
  rappelPaiement: ({ prenom, nom, periode, montant, joursRetard, echeance, appUrl }) => ({
    subject: `⚠️ Rappel — Paiement en retard ${periode}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#c0392b;font-size:22px">Rappel de paiement</h2>
      <p style="margin:0 0 24px;color:#5a5750">Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p style="color:#5a5750;margin:0 0 20px">Votre paiement pour la période <strong>${periode}</strong> est en retard de <strong>${joursRetard} jours</strong>.</p>
      ${infoBox([
        ['Montant dû', `<span style="color:#c0392b">${montant} MAD</span>`],
        ['Échéance initiale', echeance],
        ['Jours de retard', `${joursRetard} jours`],
      ])}
      ${btn('💳 Régulariser maintenant', appUrl + '/finances')}`,
      'Rappel de paiement')
  }),

  // 3. Confirmation de paiement
  confirmationPaiement: ({ prenom, nom, periode, montant, reference, appUrl }) => ({
    subject: `✅ Paiement confirmé — ${periode}`,
    html: baseTemplate(`
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:64px;height:64px;background:#e6f4ef;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">✅</div>
      </div>
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px;text-align:center">Paiement confirmé !</h2>
      <p style="text-align:center;color:#5a5750;margin:0 0 24px">Merci <strong>${prenom} ${nom}</strong>, votre paiement a bien été enregistré.</p>
      ${infoBox([
        ['Période', periode],
        ['Montant', `${montant} MAD`],
        ['Référence', reference || '—'],
        ['Statut', pill('✓ Payé')],
      ])}
      ${btn('Voir mes paiements', appUrl + '/finances')}`,
      'Confirmation de paiement')
  }),

  // 4. Convocation AG
  convocationAG: ({ prenom, nom, dateAG, heureAG, lieu, type, ordreJour, appUrl }) => ({
    subject: `📅 Convocation — Assemblée Générale ${type} du ${dateAG}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px">Convocation à l'Assemblée Générale</h2>
      <p style="margin:0 0 24px;color:#5a5750">Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p style="color:#5a5750;margin:0 0 20px">Vous êtes convoqué(e) à l'<strong>Assemblée Générale ${type}</strong> de la résidence.</p>
      ${infoBox([
        ['Type', type.charAt(0).toUpperCase()+type.slice(1)],
        ['Date', dateAG],
        ['Heure', heureAG],
        ['Lieu', lieu],
      ])}
      ${ordreJour && ordreJour.length ? `
      <div style="margin:20px 0">
        <p style="font-weight:600;color:#1a1917;margin:0 0 10px">Ordre du jour :</p>
        <ol style="margin:0;padding-left:20px;color:#5a5750;font-size:13px">
          ${ordreJour.map(r => `<li style="margin-bottom:6px">${r.titre}</li>`).join('')}
        </ol>
      </div>` : ''}
      ${btn('🗳️ Voter en ligne', appUrl + '/ag')}
      <p style="font-size:12px;color:#9a9590;margin-top:20px">Si vous ne pouvez pas être présent(e), vous pouvez voter par correspondance depuis votre espace résident.</p>`,
      'Convocation Assemblée Générale')
  }),

  // 5. Incident résolu
  incidentResolu: ({ prenom, nom, typeIncident, localisation, prestataire, cout, appUrl }) => ({
    subject: `🔧 Incident résolu — ${typeIncident}`,
    html: baseTemplate(`
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:64px;height:64px;background:#e6f4ef;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">🔧</div>
      </div>
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px;text-align:center">Incident résolu</h2>
      <p style="text-align:center;color:#5a5750;margin:0 0 24px">Bonjour <strong>${prenom} ${nom}</strong>, l'incident que vous avez signalé a été résolu.</p>
      ${infoBox([
        ['Type', typeIncident],
        ['Localisation', localisation || '—'],
        ['Prestataire', prestataire || '—'],
        ['Coût', cout ? cout + ' MAD' : '—'],
        ['Statut', pill('✓ Résolu')],
      ])}
      ${btn('Voir mes incidents', appUrl + '/incidents')}`,
      'Incident résolu')
  }),

  // 6. Nouveau document
  nouveauDocument: ({ prenom, nom, nomDoc, categorie, appUrl }) => ({
    subject: `📄 Nouveau document disponible — ${nomDoc}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px">Nouveau document disponible</h2>
      <p style="margin:0 0 24px;color:#5a5750">Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p style="color:#5a5750;margin:0 0 20px">Un nouveau document a été ajouté à la bibliothèque de la résidence.</p>
      ${infoBox([
        ['Document', nomDoc],
        ['Catégorie', categorie],
      ])}
      ${btn('📁 Voir les documents', appUrl + '/documents')}`,
      'Nouveau document disponible')
  }),

  // 7. Bienvenue
  bienvenue: ({ prenom, nom, email, password, residenceNom, appUrl }) => ({
    subject: `🏠 Bienvenue sur SyndicPro — ${residenceNom}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#0d5c47;font-size:22px">Bienvenue sur SyndicPro !</h2>
      <p style="margin:0 0 24px;color:#5a5750">Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p style="color:#5a5750;margin:0 0 20px">Votre compte copropriétaire a été créé pour la résidence <strong>${residenceNom}</strong>.</p>
      ${infoBox([
        ['Email', email],
        ['Mot de passe', `<code style="background:#f0efe9;padding:2px 8px;border-radius:4px">${password}</code>`],
        ['Résidence', residenceNom],
      ])}
      <div style="background:#e6f4ef;border-radius:8px;padding:14px 16px;margin:20px 0">
        <p style="margin:0;font-size:13px;color:#0d5c47">🔒 Pensez à changer votre mot de passe après votre première connexion.</p>
      </div>
      ${btn('Se connecter', appUrl)}`,
      'Bienvenue sur SyndicPro')
  }),
};

// ── Fonction d'envoi ──────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  Email non configuré — SMTP_USER ou SMTP_PASS manquant');
    return { success: false, reason: 'not_configured' };
  }
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`📧 Email envoyé → ${to} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Échec email → ${to}:`, err.message);
    return { success: false, error: err.message };
  }
};

// ── Envoi en masse ────────────────────────────────────────────────────────────
const sendBulk = async (recipients, templateFn, data, appUrl) => {
  const results = [];
  for (const r of recipients) {
    const tpl = templateFn({ ...data, prenom: r.prenom, nom: r.nom, appUrl });
    const res = await sendEmail({ to: r.email, ...tpl });
    results.push({ email: r.email, ...res });
    await new Promise(ok => setTimeout(ok, 200)); // rate limiting
  }
  return results;
};

module.exports = { sendEmail, sendBulk, templates };
