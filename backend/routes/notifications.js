const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const { sendEmail, sendBulk, templates } = require('../services/email');
const { sendWhatsApp, sendBulkWhatsApp } = require('../services/whatsapp');

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// ── GET /api/notifications/log — historique ───────────────────────────────────
router.get('/log', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM notifications_log
       WHERE residence_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/notifications/test — tester email ───────────────────────────────
router.post('/test', auth.gestionnaire, async (req, res) => {
  const { email } = req.body;
  const target = email || req.body.userEmail;
  try {
    const result = await sendEmail({
      to: target,
      subject: '✅ Test SyndicPro — Email configuré',
      html: `<div style="font-family:Arial;padding:40px;text-align:center">
        <h2 style="color:#0d5c47">🎉 Configuration email OK !</h2>
        <p>Votre service d'envoi d'emails SyndicPro fonctionne correctement.</p>
        <p style="color:#666;font-size:12px">Envoyé le ${new Date().toLocaleString('fr-FR')}</p>
      </div>`
    });
    await logNotification(req.user.residence_id, 'email', 'test', null, target, 'Test email', result.success ? 'sent' : 'failed');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/notifications/appel-fonds/:id — notifier appel de fonds ─────────
router.post('/appel-fonds/:id', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: paiements } = await query(
      `SELECT p.*,u.email,u.prenom,u.nom,u.telephone,u.notif_email,u.notif_sms,
              a.periode,a.echeance,a.montant_base,r.nom AS residence_nom
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       JOIN residences r ON r.id=a.residence_id
       WHERE p.appel_id=$1 AND u.notif_email=true`, [req.params.id]
    );
    if (!paiements.length) return res.json({ sent: 0, message: 'Aucun résident à notifier' });

    const first = paiements[0];
    const results = [];
    for (const p of paiements) {
      const echeance = new Date(p.echeance).toLocaleDateString('fr-FR');
      const montant = parseFloat(p.montant).toLocaleString('fr-FR');
      const tpl = templates.appelFonds({ prenom: p.prenom, nom: p.nom, periode: p.periode, montant, echeance, residenceNom: p.residence_nom, appUrl: APP_URL });
      const r = await sendEmail({ to: p.email, ...tpl });
      await logNotification(req.user.residence_id, 'email', 'appel_fonds', p.resident_id, p.email, tpl.subject, r.success ? 'sent' : 'failed');
      results.push({ email: p.email, ...r });
    }

    // SMS
    const smsTargets = paiements.filter(p => p.notif_sms && p.telephone);
    if (smsTargets.length) {
      await sendBulkWhatsApp(smsTargets, 'appelFonds', {
        periode: first.periode,
        montant: parseFloat(first.montant_base),
        echeance: new Date(first.echeance).toLocaleDateString('fr-FR'),
      });
    }
    res.json({ sent: results.length, smsSent: smsTargets.length, results });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── POST /api/notifications/convocation-ag/:id ────────────────────────────────
router.post('/convocation-ag/:id', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: [ag] } = await query(
      `SELECT a.*,r.nom AS residence_nom FROM assemblees_generales a
       JOIN residences r ON r.id=a.residence_id WHERE a.id=$1`, [req.params.id]
    );
    if (!ag) return res.status(404).json({ error: 'AG non trouvée' });

    const { rows: residents } = await query(
      `SELECT id,email,prenom,nom,telephone,notif_email,notif_sms
       FROM utilisateurs WHERE residence_id=$1 AND role='resident' AND notif_email=true`,
      [req.user.residence_id]
    );

    const dateAG  = new Date(ag.date_ag).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    const heureAG = new Date(ag.date_ag).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const results = [];
    for (const r of residents) {
      const tpl = templates.convocationAG({ prenom: r.prenom, nom: r.nom, dateAG, heureAG, lieu: ag.lieu, type: ag.type, ordreJour: ag.ordre_du_jour || [], appUrl: APP_URL });
      const res2 = await sendEmail({ to: r.email, ...tpl });
      await logNotification(req.user.residence_id, 'email', 'convocation_ag', r.id, r.email, tpl.subject, res2.success ? 'sent' : 'failed');
      results.push({ email: r.email, ...res2 });
    }

    // SMS
    const smsTargets = residents.filter(r => r.notif_sms && r.telephone);
    await sendBulkWhatsApp(smsTargets, 'convocationAG', { dateAG, heureAG, lieu: ag.lieu });

    res.json({ sent: results.length, smsSent: smsTargets.length, results });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── POST /api/notifications/rappel-impayes ────────────────────────────────────
router.post('/rappel-impayes', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: impayes } = await query(
      `SELECT p.*,u.email,u.prenom,u.nom,u.telephone,u.notif_email,u.notif_sms,
              a.periode,a.echeance,CURRENT_DATE - a.echeance AS jours_retard
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       WHERE a.residence_id=$1 AND p.statut IN ('retard','impaye') AND a.statut='actif' AND u.notif_email=true`,
      [req.user.residence_id]
    );

    const results = [];
    for (const p of impayes) {
      const tpl = templates.rappelPaiement({
        prenom: p.prenom, nom: p.nom, periode: p.periode,
        montant: parseFloat(p.montant).toLocaleString('fr-FR'),
        joursRetard: p.jours_retard || 0,
        echeance: new Date(p.echeance).toLocaleDateString('fr-FR'),
        appUrl: APP_URL,
      });
      const r = await sendEmail({ to: p.email, ...tpl });
      await logNotification(req.user.residence_id, 'email', 'rappel_paiement', p.resident_id, p.email, tpl.subject, r.success ? 'sent' : 'failed');
      results.push({ email: p.email, ...r });
    }

    // SMS
    const smsTargets = impayes.filter(p => p.notif_sms && p.telephone);
    for (const p of smsTargets) {
      await sendBulkWhatsApp([p], 'rappelPaiement', {
        montant: parseFloat(p.montant).toLocaleString('fr-FR'),
        joursRetard: p.jours_retard || 0,
      });
    }
    res.json({ sent: results.length, smsSent: smsTargets.length, results });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── POST /api/notifications/bienvenue/:userId ─────────────────────────────────
router.post('/bienvenue/:userId', auth.gestionnaire, async (req, res) => {
  const { password } = req.body;
  try {
    const { rows: [user] } = await query(
      `SELECT u.*,r.nom AS residence_nom FROM utilisateurs u
       JOIN residences r ON r.id=u.residence_id WHERE u.id=$1`, [req.params.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const tpl = templates.bienvenue({ prenom: user.prenom, nom: user.nom, email: user.email, password: password || '(fourni séparément)', residenceNom: user.residence_nom, appUrl: APP_URL });
    const result = await sendEmail({ to: user.email, ...tpl });
    await logNotification(req.user.residence_id, 'email', 'bienvenue', user.id, user.email, tpl.subject, result.success ? 'sent' : 'failed');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Helper log ────────────────────────────────────────────────────────────────
async function logNotification(residenceId, type, event, recipientId, email, subject, status) {
  try {
    await query(
      `INSERT INTO notifications_log (residence_id,type,event,recipient_id,recipient_email,subject,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [residenceId, type, event, recipientId, email, subject, status]
    );
  } catch(e) { console.warn('Log notification failed:', e.message); }
}


// ── POST /api/notifications/jardinage ────────────────────────────────────────
router.post('/jardinage', auth.gestionnaire, async (req, res) => {
  const { villa, dateLabel, description, prestataire, resident_ids } = req.body;
  if (!resident_ids?.length) return res.json({ sent: 0 });
  let sent = 0;
  try {
    for (const residentId of resident_ids) {
      const { rows: [resident] } = await query(
        `SELECT email, prenom, nom, notif_email FROM utilisateurs WHERE id=$1`, [residentId]
      );
      if (!resident?.email || !resident.notif_email) continue;
      try {
        await sendEmail({
          to: resident.email,
          subject: `🌿 Intervention jardinage — ${villa} le ${dateLabel}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
            <div style="background:#1a7a52;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">🌿 Intervention jardinage planifiée</h2>
            </div>
            <div style="background:#fff;border:1px solid #ddd;padding:20px;border-radius:0 0 8px 8px">
              <p>Bonjour <strong>${resident.prenom}</strong>,</p>
              <p>Une intervention jardinage est planifiée pour votre villa/lot :</p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0">
                <tr><td style="padding:8px;background:#e8f8f0;font-weight:bold">Villa / Lot</td><td style="padding:8px">${villa}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Date</td><td style="padding:8px"><strong>${dateLabel}</strong></td></tr>
                <tr><td style="padding:8px;background:#e8f8f0;font-weight:bold">Type</td><td style="padding:8px">${description}</td></tr>
                ${prestataire ? `<tr><td style="padding:8px;font-weight:bold">Prestataire</td><td style="padding:8px">${prestataire}</td></tr>` : ''}
              </table>
              <div style="background:#e8f8f0;border-left:4px solid #1a7a52;padding:12px;border-radius:0 6px 6px 0;font-size:13px;color:#1a7a52">
                Merci de vous assurer que l'accès à votre espace vert est dégagé à cette date.
              </div>
              <div style="text-align:center;margin-top:20px">
                <a href="${APP_URL}" style="background:#1a7a52;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Voir mon planning</a>
              </div>
            </div></body></html>`
        });
        await logNotification(req.user.residence_id, 'email', 'jardinage', residentId, resident.email,
          `Jardinage ${villa} — ${dateLabel}`, 'sent');
        sent++;
      } catch(e) { console.warn('Email jardinage:', resident.email, e.message); }
    }
    res.json({ sent, villa, dateLabel });
  } catch(e) {
    console.error('Jardinage notif error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
