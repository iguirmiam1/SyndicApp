// ══════════════════════════════════════════════════════════════
// Push Notifications Routes — /api/push
// ══════════════════════════════════════════════════════════════

const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

let webpush = { isConfigured: () => false, VAPID_PUBLIC_KEY: '' };
try { webpush = require('../services/webpush'); } catch(e) {}

// Migration auto de la table push_subscriptions
const ensurePushTable = async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      keys JSONB NOT NULL,
      user_agent VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  } catch(e) { console.warn('push_subscriptions table:', e.message); }
};
ensurePushTable();

// GET /api/push/vapid-key — clé publique pour le frontend
router.get('/vapid-key', (req, res) => {
  res.json({
    publicKey: webpush.VAPID_PUBLIC_KEY || '',
    configured: webpush.isConfigured(),
  });
});

// POST /api/push/subscribe — enregistrer/mettre à jour une subscription
router.post('/subscribe', auth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys)
    return res.status(400).json({ error: 'Subscription invalide' });
  try {
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET keys=$3, user_id=$1, updated_at=NOW()`,
      [
        req.user.id,
        subscription.endpoint,
        JSON.stringify(subscription.keys),
        req.headers['user-agent']?.substring(0, 200) || null,
      ]
    );
    // Activer notif_sms sur le profil (réutilise le flag existant)
    await query(
      `UPDATE utilisateurs SET notif_sms=true WHERE id=$1`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('Push subscribe error:', e.message);
    res.status(500).json({ error: 'Erreur enregistrement' });
  }
});

// DELETE /api/push/subscribe — désabonner
router.delete('/subscribe', auth, async (req, res) => {
  try {
    await query(
      `DELETE FROM push_subscriptions WHERE user_id=$1`,
      [req.user.id]
    );
    await query(`UPDATE utilisateurs SET notif_sms=false WHERE id=$1`, [req.user.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur désinscription' }); }
});

// POST /api/push/test — test depuis le profil
router.post('/test', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT endpoint, keys FROM push_subscriptions WHERE user_id=$1`, [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Aucune subscription' });
    const sub = { endpoint: rows[0].endpoint, keys: rows[0].keys };
    const result = await webpush.sendPush(sub, {
      title: 'Test SyndicPro',
      body: 'Vos notifications push fonctionnent !',
      icon: '/icon-192.png',
      tag: 'test',
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Fonction utilitaire pour envoyer push depuis d'autres routes
const sendPushToUser = async (userId, payload) => {
  try {
    const { rows } = await query(
      `SELECT endpoint, keys FROM push_subscriptions WHERE user_id=$1`, [userId]
    );
    for (const row of rows) {
      const sub = { endpoint: row.endpoint, keys: row.keys };
      const result = await webpush.sendPush(sub, payload);
      if (result.expired) {
        await query('DELETE FROM push_subscriptions WHERE endpoint=$1', [row.endpoint]);
      }
    }
  } catch(e) { console.warn('sendPushToUser:', e.message); }
};

const sendPushToResidence = async (residenceId, payload) => {
  try {
    const { rows } = await query(
      `SELECT ps.endpoint, ps.keys FROM push_subscriptions ps
       JOIN utilisateurs u ON u.id=ps.user_id
       WHERE u.residence_id=$1 AND u.role='resident'`,
      [residenceId]
    );
    for (const row of rows) {
      const sub = { endpoint: row.endpoint, keys: row.keys };
      const result = await webpush.sendPush(sub, payload);
      if (result.expired) {
        await query('DELETE FROM push_subscriptions WHERE endpoint=$1', [row.endpoint]).catch(() => {});
      }
    }
    return rows.length;
  } catch(e) { console.warn('sendPushToResidence:', e.message); return 0; }
};

router.sendPushToUser = sendPushToUser;
router.sendPushToResidence = sendPushToResidence;

module.exports = router;
