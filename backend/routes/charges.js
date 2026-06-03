const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

const sendNotifEmail = async (to, subject, html) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST||'smtp.gmail.com', port:587,
      secure:false, auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
    });
    await t.sendMail({from:`"SyndicPro" <${process.env.SMTP_USER}>`,to,subject,html});
    console.log(`📧 Email → ${to}`);
  } catch(e){console.warn('Email:',e.message);}
};

const tpl = (titre,corps,btnL,btnU) => `<!DOCTYPE html><html><body style="font-family:Arial;background:#f7f6f2;padding:40px 20px">
<table width="560" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e0d8">
<tr><td style="background:#0d5c47;padding:20px 28px"><b style="color:#fff;font-size:20px">SyndicPro</b></td></tr>
<tr><td style="padding:28px"><h3 style="color:#0d5c47;margin:0 0 14px">${titre}</h3>
<div style="font-size:13px;color:#5a5750;line-height:1.8">${corps}</div>
${btnL?`<div style="text-align:center;margin:20px 0"><a href="${btnU}" style="background:#0d5c47;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${btnL}</a></div>`:''}
</td></tr></table></body></html>`;

// ── GET /api/charges ──────────────────────────────────────────────────────────
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
         COUNT(p.id) AS nb_paiements,
         SUM(CASE WHEN p.statut='paye' THEN p.montant ELSE 0 END) AS total_encaisse,
         COUNT(CASE WHEN p.statut='declare' THEN 1 END) AS nb_declares
       FROM appels_fonds a LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges ─────────────────────────────────────────────────────────
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, montant_base, echeance, description } = req.body;
  if (!periode || !montant_base || !echeance)
    return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { rows:[af] } = await query(
      `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,description,statut)
       VALUES ($1,$2,$3,$4,$5,'actif') RETURNING *`,
      [req.user.residence_id, periode, parseFloat(montant_base), echeance, description||'']
    );
    const { rows:residents } = await query(
      `SELECT id,tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for (const r of residents) {
      const m = parseFloat(montant_base)*(r.tantiemes||0)/1000 || parseFloat(montant_base);
      await query(
        `INSERT INTO paiements (appel_id,resident_id,montant,statut) VALUES ($1,$2,$3,'en_attente') ON CONFLICT DO NOTHING`,
        [af.id, r.id, m]
      );
    }
    res.status(201).json(af);
  } catch(e) { res.status(500).json({ error: 'Erreur: '+e.message }); }
});

// ── GET /api/charges/resident/moi ─────────────────────────────────────────────
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,a.periode,a.echeance,a.description,a.statut AS statut_appel
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/charges/declarations/pending — déclarations à valider ────────────
router.get('/declarations/pending', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.email,u.telephone,a.periode,a.echeance
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       WHERE a.residence_id=$1 AND p.statut='declare'
       ORDER BY p.updated_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/charges/:id/paiements ────────────────────────────────────────────
router.get('/:id/paiements', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.tantiemes,u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1 ORDER BY p.statut,u.nom`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges/paiements/:id/payer — résident déclare ─────────────────
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, date_paiement, reference } = req.body;
  try {
    const { rows:[p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role === 'resident' && p.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    // Statut = 'declare' : en attente de validation syndic
    const { rows:[updated] } = await query(
      `UPDATE paiements SET statut='declare',mode=$1,date_paiement=$2,reference=$3,updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [mode||'virement', date_paiement||new Date().toISOString().split('T')[0], reference||null, req.params.id]
    );

    // Notifier le gestionnaire
    try {
      const { rows:[g] } = await query(
        `SELECT email FROM utilisateurs WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
        [req.user.residence_id]
      );
      const { rows:[af] } = await query(`SELECT periode FROM appels_fonds WHERE id=$1`,[p.appel_id]);
      if (g?.email) {
        await sendNotifEmail(g.email,
          `💳 Paiement à valider — ${req.user.prenom} ${req.user.nom} (Lot ${req.user.lot||'?'})`,
          tpl('Nouveau paiement déclaré',
            `<b>${req.user.prenom} ${req.user.nom}</b> (Lot <b>${req.user.lot||'?'}</b>) a déclaré un paiement :<br><br>
            <b>Période :</b> ${af?.periode||'—'}<br>
            <b>Montant :</b> ${parseFloat(p.montant).toLocaleString('fr-FR')} MAD<br>
            <b>Mode :</b> ${mode||'virement'}<br>
            <b>Date :</b> ${date_paiement||'aujourd\'hui'}<br>
            <b>Référence :</b> ${reference||'—'}<br><br>
            <div style="background:#fef8ec;border:1px solid rgba(176,107,16,.3);border-radius:8px;padding:10px 14px;font-size:12px;color:#b06b10">
              ⚠️ Ce paiement est en attente de votre validation.
            </div>`,
            'Valider maintenant', APP_URL)
        );
      }
    } catch(e) { console.warn('Notif gestionnaire:', e.message); }

    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur: '+e.message }); }
});

// ── POST /api/charges/paiements/:id/valider — syndic valide ──────────────────
router.post('/paiements/:id/valider', auth.gestionnaire, async (req, res) => {
  const { commentaire } = req.body;
  try {
    const { rows:[p] } = await query(
      `SELECT p.*,u.email,u.prenom,u.nom,u.lot,u.notif_email,a.periode
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id WHERE p.id=$1`, [req.params.id]
    );
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    // Essayer avec commentaire_syndic, fallback sans
    let updated;
    try {
      ({ rows:[updated] } = await query(
        `UPDATE paiements SET statut='paye',commentaire_syndic=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
        [commentaire||null, req.params.id]
      ));
    } catch(e) {
      ({ rows:[updated] } = await query(
        `UPDATE paiements SET statut='paye',updated_at=NOW() WHERE id=$1 RETURNING *`,
        [req.params.id]
      ));
    }

    // Email confirmation au résident
    if (p.notif_email !== false && p.email) {
      await sendNotifEmail(p.email,
        `✅ Paiement confirmé — ${p.periode}`,
        tpl('Votre paiement a été validé !',
          `Bonjour <b>${p.prenom}</b>,<br><br>
          Votre déclaration de paiement pour <b>${p.periode}</b> a été vérifiée et confirmée par le syndic.<br><br>
          <b>Montant :</b> ${parseFloat(p.montant).toLocaleString('fr-FR')} MAD<br>
          <b>Mode :</b> ${p.mode||'—'}<br>
          <b>Référence :</b> ${p.reference||'—'}<br>
          ${commentaire?`<br><b>Note du syndic :</b> ${commentaire}`:''}`,
          'Voir mes paiements', APP_URL)
      );
    }
    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur: '+e.message }); }
});

// ── POST /api/charges/paiements/:id/rejeter — syndic rejette ─────────────────
router.post('/paiements/:id/rejeter', auth.gestionnaire, async (req, res) => {
  const { motif } = req.body;
  if (!motif) return res.status(400).json({ error: 'Motif de rejet requis' });
  try {
    const { rows:[p] } = await query(
      `SELECT p.*,u.email,u.prenom,u.nom,u.notif_email,a.periode
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id WHERE p.id=$1`, [req.params.id]
    );
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    let updated;
    try {
      ({ rows:[updated] } = await query(
        `UPDATE paiements SET statut='en_attente',commentaire_syndic=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
        [`Rejeté : ${motif}`, req.params.id]
      ));
    } catch(e) {
      ({ rows:[updated] } = await query(
        `UPDATE paiements SET statut='en_attente',updated_at=NOW() WHERE id=$1 RETURNING *`,
        [req.params.id]
      ));
    }

    // Email rejet au résident
    if (p.notif_email !== false && p.email) {
      await sendNotifEmail(p.email,
        `⚠️ Paiement non confirmé — ${p.periode}`,
        tpl('Déclaration non confirmée',
          `Bonjour <b>${p.prenom}</b>,<br><br>
          Votre déclaration de paiement pour <b>${p.periode}</b> n'a pas pu être confirmée.<br><br>
          <div style="background:#fdf1f0;border-left:4px solid #c0392b;padding:12px 16px;border-radius:0 8px 8px 0">
            <b style="color:#c0392b">Motif :</b> ${motif}
          </div><br>
          Merci de contacter votre syndic ou de soumettre à nouveau un justificatif.`,
          'Déclarer à nouveau', APP_URL)
      );
    }
    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur: '+e.message }); }
});

// ── PUT /api/charges/paiements/:id ────────────────────────────────────────────
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  const { statut, mode, date_paiement, reference } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1,mode=$2,date_paiement=$3,reference=$4,updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [statut,mode||null,date_paiement||null,reference||null,req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
