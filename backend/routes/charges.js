const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

let sendEmail = async () => {};
try { ({ sendEmail } = require('../services/email')); } catch(e) {}
const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// Mise à jour paiement ultra-robuste : essaie chaque colonne séparément
const updatePaiement = async (id, fields) => {
  // Essai 1 : toutes les colonnes ensemble
  const cols = Object.keys(fields).filter(k => fields[k] !== undefined);
  const vals = cols.map(k => fields[k]);
  try {
    const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const { rows } = await query(
      `UPDATE paiements SET ${sets} WHERE id=$${cols.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0];
  } catch(e) {
    console.warn('Full update failed, trying statut only:', e.message);
  }
  // Essai 2 : seulement le statut (toujours disponible)
  const { rows } = await query(
    `UPDATE paiements SET statut=$1 WHERE id=$2 RETURNING *`,
    [fields.statut, id]
  );
  // Essais optionnels colonne par colonne (silencieux)
  for (const [col, val] of Object.entries(fields)) {
    if (col === 'statut' || val === undefined || val === null) continue;
    try {
      await query(`UPDATE paiements SET ${col}=$1 WHERE id=$2`, [val, id]);
    } catch(e) { /* colonne n'existe pas encore */ }
  }
  return rows[0];
};

// GET /api/charges
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, COUNT(p.id) AS nb_paiements,
         SUM(CASE WHEN p.statut='paye' THEN p.montant ELSE 0 END) AS total_encaisse,
         SUM(CASE WHEN p.statut='declare' THEN 1 ELSE 0 END) AS nb_declares
       FROM appels_fonds a LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/charges
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, montant_base, echeance, description } = req.body;
  if (!periode || !montant_base || !echeance)
    return res.status(400).json({ error: 'Champs requis' });
  try {
    // Tenter avec description, fallback sans si la colonne n'existe pas
    let af;
    try {
      const { rows } = await query(
        `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,description,statut)
         VALUES ($1,$2,$3,$4,$5,'actif') RETURNING *`,
        [req.user.residence_id, periode, parseFloat(montant_base), echeance, description || '']
      );
      af = rows[0];
    } catch(e) {
      // description n'existe peut-être pas dans la table
      const { rows } = await query(
        `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,statut)
         VALUES ($1,$2,$3,$4,'actif') RETURNING *`,
        [req.user.residence_id, periode, parseFloat(montant_base), echeance]
      );
      af = rows[0];
    }
    const { rows: residents } = await query(
      `SELECT id, tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for (const r of residents) {
      const m = parseFloat(montant_base) * (r.tantiemes || 0) / 1000 || parseFloat(montant_base);
      // Vérifier si le paiement existe déjà avant d'insérer
      const { rows: existing } = await query(
        `SELECT id FROM paiements WHERE appel_id=$1 AND resident_id=$2 LIMIT 1`,
        [af.id, r.id]
      );
      if (!existing.length) {
        await query(
          `INSERT INTO paiements (appel_id,resident_id,montant,statut)
           VALUES ($1,$2,$3,'en_attente')`,
          [af.id, r.id, m]
        );
      }
    }
    res.status(201).json(af);
  } catch(e) {
    console.error('POST /charges error:', e.message);
    res.status(500).json({ error: 'Erreur: ' + e.message });
  }
});

// GET /api/charges/resident/moi
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, a.periode, a.echeance, a.description
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/charges/declarations/pending
router.get('/declarations/pending', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.prenom, u.nom, u.lot, u.email, a.periode, a.echeance
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       WHERE a.residence_id=$1 AND p.statut='declare'
       ORDER BY p.id DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.json([]); }
});

// GET /api/charges/:id/paiements
router.get('/:id/paiements', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.prenom, u.nom, u.lot, u.tantiemes, u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1 ORDER BY u.nom`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /payer : résident déclare son paiement ───────────────────────────────
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, date_paiement, reference } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paiement non trouvé' });
    if (req.user.role === 'resident' && p.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    // Mise à jour robuste — fonctionne même sans les nouvelles colonnes
    const updated = await updatePaiement(req.params.id, {
      statut: 'declare',
      mode: mode || 'virement',
      date_paiement: date_paiement || new Date().toISOString().split('T')[0],
      reference: reference || null,
    });

    // Email gestionnaire (non bloquant)
    setImmediate(async () => {
      try {
        const { rows: [g] } = await query(
          `SELECT email FROM utilisateurs WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
          [req.user.residence_id]
        );
        const { rows: [a] } = await query(`SELECT periode FROM appels_fonds WHERE id=$1`, [p.appel_id]);
        if (g?.email) await sendEmail({
          to: g.email,
          subject: `💳 Paiement à valider — ${req.user.prenom} ${req.user.nom}`,
          html: `<p><b>${req.user.prenom} ${req.user.nom}</b> (Lot ${req.user.lot || '?'}) a déclaré un paiement de <b>${parseFloat(p.montant || 0).toLocaleString('fr-FR')} MAD</b> pour <b>${a?.periode || '—'}</b>.<br>
Mode: ${mode || '—'} · Date: ${date_paiement || '—'} · Réf: ${reference || '—'}</p>
<p><a href="${APP_URL}">Valider sur SyndicPro →</a></p>`
        });
      } catch(e) { console.warn('Email notif:', e.message); }
    });

    res.json(updated);
  } catch(e) {
    console.error('POST /payer error:', e.message);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// ── POST /valider : syndic valide le paiement ─────────────────────────────────
router.post('/paiements/:id/valider', auth.gestionnaire, async (req, res) => {
  const { commentaire } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    const updated = await updatePaiement(req.params.id, {
      statut: 'paye',
      commentaire_syndic: commentaire || null,
    });

    setImmediate(async () => {
      try {
        const { rows: [ri] } = await query(
          `SELECT u.email,u.prenom,a.periode FROM utilisateurs u, appels_fonds a
           WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
        );
        if (ri?.email) await sendEmail({
          to: ri.email,
          subject: `✅ Paiement validé — ${ri.periode}`,
          html: `<p>Bonjour <b>${ri.prenom}</b>,</p>
<p>Votre paiement pour <b>${ri.periode}</b> a été <b style="color:#0d5c47">confirmé par le syndic</b>.</p>
<p>Montant validé : <b>${parseFloat(p.montant || 0).toLocaleString('fr-FR')} MAD</b></p>
${commentaire ? `<p>Message du syndic : ${commentaire}</p>` : ''}
<p><a href="${APP_URL}">Voir mes paiements</a></p>`
        });
      } catch(e) { console.warn('Email validation:', e.message); }
    });

    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /rejeter : syndic rejette ───────────────────────────────────────────
router.post('/paiements/:id/rejeter', auth.gestionnaire, async (req, res) => {
  const { motif } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    const updated = await updatePaiement(req.params.id, {
      statut: 'en_attente',
      commentaire_syndic: `Rejeté : ${motif}`,
    });

    setImmediate(async () => {
      try {
        const { rows: [ri] } = await query(
          `SELECT u.email,u.prenom,a.periode FROM utilisateurs u, appels_fonds a
           WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
        );
        if (ri?.email) await sendEmail({
          to: ri.email,
          subject: `⚠️ Déclaration rejetée — ${ri.periode}`,
          html: `<p>Bonjour <b>${ri.prenom}</b>,</p>
<p>Votre déclaration pour <b>${ri.periode}</b> n'a pas été confirmée.</p>
<p><b>Motif :</b> ${motif}</p>
<p><a href="${APP_URL}">Re-déclarer sur SyndicPro</a></p>`
        });
      } catch(e) { console.warn('Email rejet:', e.message); }
    });

    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/charges/paiements/:id
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  const { statut } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1 WHERE id=$2 RETURNING *`, [statut, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
