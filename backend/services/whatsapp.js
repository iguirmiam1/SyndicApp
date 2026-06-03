// ── WhatsApp via Twilio API ───────────────────────────────────────────────────
// Prérequis : même compte Twilio + activer WhatsApp Business
// Sandbox gratuit : twilio.com/console/messaging/whatsapp/sandbox
// Production : WhatsApp Business Account approuvé par Meta

const isConfigured = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

const formatPhone = (raw) => {
  let p = (raw || '').replace(/[\s\-().]/g, '');
  // Maroc : 06XXXXXXXX → +2126XXXXXXXX
  if (p.startsWith('06') || p.startsWith('07') || p.startsWith('05'))
    p = '+212' + p.slice(1);
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;
  return p;
};

const sendWhatsApp = async ({ to, message }) => {
  if (!isConfigured()) {
    console.warn('⚠️  WhatsApp non configuré — TWILIO_ACCOUNT_SID manquant');
    return { success: false, reason: 'not_configured' };
  }
  try {
    const client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const phone = formatPhone(to);
    // FROM : numéro sandbox ou numéro WhatsApp Business approuvé
    const from = process.env.TWILIO_WHATSAPP_FROM
      ? (process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
          ? process.env.TWILIO_WHATSAPP_FROM
          : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`)
      : 'whatsapp:+14155238886'; // sandbox Twilio par défaut

    const msg = await client.messages.create({
      body: message,
      from,
      to: `whatsapp:${phone}`,
    });
    console.log(`📱 WhatsApp envoyé → ${phone} (${msg.sid})`);
    return { success: true, sid: msg.sid };
  } catch(e) {
    console.error(`❌ WhatsApp échoué → ${to}:`, e.message);
    return { success: false, error: e.message };
  }
};

// ── Templates WhatsApp (format texte enrichi supporté) ───────────────────────
const templates = {
  appelFonds: ({ prenom, periode, montant, echeance }) =>
    `🏠 *SyndicPro*\n\nBonjour *${prenom}*,\n\n📋 Appel de fonds *${periode}*\n💰 Montant : *${montant} MAD*\n📅 Échéance : ${echeance}\n\nMerci de régulariser votre situation avant l'échéance.`,

  rappelPaiement: ({ prenom, montant, joursRetard }) =>
    `⚠️ *SyndicPro — Rappel*\n\nBonjour *${prenom}*,\n\nVotre paiement de *${montant} MAD* est en retard de *${joursRetard} jours*.\n\nMerci de contacter votre syndic pour régulariser.`,

  convocationAG: ({ prenom, dateAG, heureAG, lieu }) =>
    `📅 *SyndicPro — Convocation AG*\n\nBonjour *${prenom}*,\n\nVous êtes convoqué(e) à l'Assemblée Générale :\n📆 *${dateAG}* à *${heureAG}*\n📍 ${lieu}\n\nConnectez-vous sur l'application pour voter.`,

  incidentResolu: ({ prenom, typeIncident }) =>
    `✅ *SyndicPro*\n\nBonjour *${prenom}*,\n\nVotre incident *${typeIncident}* a été résolu. Merci de votre signalement !`,

  paiementConfirme: ({ prenom, montant, periode }) =>
    `✅ *SyndicPro*\n\nBonjour *${prenom}*,\n\nVotre paiement de *${montant} MAD* pour *${periode}* a bien été enregistré. Merci !`,

  bienvenue: ({ prenom, residenceNom }) =>
    `🏠 *Bienvenue sur SyndicPro !*\n\nBonjour *${prenom}*,\n\nVotre compte copropriétaire est créé pour la résidence *${residenceNom}*.\n\nConnectez-vous dès maintenant sur l'application.`,
};

const sendBulkWhatsApp = async (recipients, templateKey, data) => {
  const results = [];
  for (const r of recipients) {
    if (!r.telephone || !r.notif_sms) continue; // notif_sms contrôle aussi WhatsApp
    const message = templates[templateKey]
      ? templates[templateKey]({ ...data, prenom: r.prenom })
      : data.message || '';
    const res = await sendWhatsApp({ to: r.telephone, message });
    results.push({ telephone: r.telephone, ...res });
    await new Promise(ok => setTimeout(ok, 400)); // rate limit Twilio
  }
  return results;
};

module.exports = { sendWhatsApp, sendBulkWhatsApp, templates };
