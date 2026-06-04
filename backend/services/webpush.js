// ══════════════════════════════════════════════════════════════
// SyndicPro — Web Push Notifications Service (Phase 4)
// ══════════════════════════════════════════════════════════════

const isConfigured = () =>
  !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let _webpush = null;
const getWebPush = () => {
  if (!isConfigured()) return null;
  if (!_webpush) {
    _webpush = require('web-push');
    _webpush.setVapidDetails(
      'mailto:' + (process.env.SMTP_USER || 'admin@syndicpro.ma'),
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  return _webpush;
};

// Envoyer une notification push à une subscription
const sendPush = async (subscription, payload) => {
  const wp = getWebPush();
  if (!wp || !subscription) return { success: false, reason: 'not_configured' };
  try {
    await wp.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 } // 24h TTL
    );
    return { success: true };
  } catch(e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      // Subscription expirée
      return { success: false, expired: true, endpoint: subscription.endpoint };
    }
    console.warn('[WebPush] Send failed:', e.message);
    return { success: false, error: e.message };
  }
};

// Templates de notifications
const notifications = {
  paiementValide: ({ prenom, periode, montant }) => ({
    title: 'Paiement confirmé',
    body: `Votre paiement de ${montant} MAD pour ${periode} est validé`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'paiement-valide',
    data: { url: '/?page=r-finances' },
    requireInteraction: false,
  }),
  paiementRejete: ({ prenom, periode, motif }) => ({
    title: 'Paiement non confirmé',
    body: `${periode} : ${motif || 'Contactez votre syndic'}`,
    icon: '/icon-192.png',
    tag: 'paiement-rejete',
    data: { url: '/?page=r-finances' },
    requireInteraction: true,
  }),
  nouvelleCotisation: ({ periode, montant, echeance }) => ({
    title: 'Nouvel appel de fonds',
    body: `${periode} — ${montant} MAD, échéance ${echeance}`,
    icon: '/icon-192.png',
    tag: 'cotisation-' + periode,
    data: { url: '/?page=r-finances' },
    actions: [{ action: 'pay', title: 'Déclarer mon paiement' }],
    requireInteraction: true,
  }),
  incidentMisAJour: ({ type, statut, commentaire }) => ({
    title: 'Réclamation mise à jour',
    body: `${type} : ${statut}${commentaire ? ' — ' + commentaire.substring(0,60) : ''}`,
    icon: '/icon-192.png',
    tag: 'incident-update',
    data: { url: '/?page=r-incidents' },
  }),
  jardinage: ({ villa, dateLabel, type }) => ({
    title: 'Intervention jardinage',
    body: `${villa} — ${type} le ${dateLabel}`,
    icon: '/icon-192.png',
    tag: 'jardinage-' + dateLabel,
    data: { url: '/?page=r-jardinage' },
  }),
  message: ({ expediteur, contenu }) => ({
    title: 'Nouveau message',
    body: `${expediteur} : ${contenu?.substring(0, 80)}`,
    icon: '/icon-192.png',
    tag: 'message',
    data: { url: '/?page=r-messagerie' },
  }),
};

// Envoyer en masse à une liste d'users avec nettoyage auto des expired
const sendBulkPush = async (subscriptions, payloadFn, data, db_query) => {
  const wp = getWebPush();
  if (!wp) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  const expired = [];
  for (const sub of subscriptions) {
    const result = await sendPush(sub.subscription, payloadFn(data));
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.expired) expired.push(sub.endpoint);
    }
    await new Promise(r => setTimeout(r, 100)); // Rate limiting
  }
  // Nettoyer les subscriptions expirées
  if (expired.length && db_query) {
    for (const ep of expired) {
      db_query('DELETE FROM push_subscriptions WHERE endpoint=$1', [ep]).catch(() => {});
    }
  }
  return { sent, failed, total: subscriptions.length };
};

module.exports = {
  sendPush,
  sendBulkPush,
  notifications,
  isConfigured,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
};
