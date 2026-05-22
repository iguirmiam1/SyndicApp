// ── SMS via Twilio ────────────────────────────────────────────────────────────
const sendSMS = async ({ to, message }) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('⚠️  SMS non configuré — TWILIO_ACCOUNT_SID manquant');
    return { success: false, reason: 'not_configured' };
  }
  try {
    const client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    // Formater le numéro marocain : 06XXXXXXXX → +2126XXXXXXXX
    let phone = to.replace(/\s/g, '');
    if (phone.startsWith('0')) phone = '+212' + phone.slice(1);
    if (!phone.startsWith('+')) phone = '+' + phone;

    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM,
      to: phone,
    });
    console.log(`📱 SMS envoyé → ${phone} (${msg.sid})`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error(`❌ Échec SMS → ${to}:`, err.message);
    return { success: false, error: err.message };
  }
};

// ── Templates SMS ─────────────────────────────────────────────────────────────
const smsTemplates = {
  appelFonds: ({ prenom, periode, montant, echeance }) =>
    `SyndicPro: Bonjour ${prenom}, appel de fonds ${periode} émis. Montant: ${montant} MAD. Échéance: ${echeance}. Connectez-vous pour payer.`,

  rappelPaiement: ({ prenom, montant, joursRetard }) =>
    `SyndicPro ⚠️ Bonjour ${prenom}, votre paiement de ${montant} MAD est en retard de ${joursRetard} jours. Régularisez dès que possible.`,

  convocationAG: ({ prenom, dateAG, heureAG, lieu }) =>
    `SyndicPro: Bonjour ${prenom}, vous êtes convoqué(e) à l'AG le ${dateAG} à ${heureAG} - ${lieu}. Connectez-vous pour voter.`,

  incidentResolu: ({ prenom, typeIncident }) =>
    `SyndicPro ✅ Bonjour ${prenom}, votre incident "${typeIncident}" a été résolu. Merci pour votre signalement.`,

  paiementConfirme: ({ prenom, montant, periode }) =>
    `SyndicPro ✅ Bonjour ${prenom}, paiement de ${montant} MAD pour ${periode} confirmé. Merci !`,
};

// ── Envoi en masse ────────────────────────────────────────────────────────────
const sendBulkSMS = async (recipients, templateKey, data) => {
  const results = [];
  for (const r of recipients) {
    if (!r.telephone || !r.notif_sms) continue;
    const message = smsTemplates[templateKey]({ ...data, prenom: r.prenom });
    const res = await sendSMS({ to: r.telephone, message });
    results.push({ telephone: r.telephone, ...res });
    await new Promise(ok => setTimeout(ok, 300));
  }
  return results;
};

module.exports = { sendSMS, sendBulkSMS, smsTemplates };
