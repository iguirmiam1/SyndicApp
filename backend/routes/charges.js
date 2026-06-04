const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

let sendEmail = async () => {};
try { ({ sendEmail } = require('../services/email')); } catch(e) {}
const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// Vérifier et ajouter les colonnes manquantes
const ensureSchema = async () => {
  // Supprimer les contraintes CHECK qui bloquent les nouveaux statuts/modes
  const dropConstraints = [
    `ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_mode_check`,
    `ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_statut_check`,
    `ALTER TABLE paiements DROP CONSTRAINT IF EXISTS check_mode`,
    `ALTER TABLE paiements DROP CONSTRAINT IF EXISTS check_statut`,
  ];
  for (const sql of dropConstraints) {
    try { await query(sql); console.log('✅ Contrainte supprimée:', sql.substring(30,70)); }
    catch(e) { /* ignore si n'existe pas */ }
  }

  const fixes = [
    `ALTER TABLE paiements   ADD COLUMN IF NOT EXISTS mode               VARCHAR(30)`,
    `ALTER TABLE paiements   ADD COLUMN IF NOT EXISTS date_paiement      DATE`,
    `ALTER TABLE paiements   ADD COLUMN IF NOT EXISTS reference          VARCHAR(100)`,
    `ALTER TABLE paiements   ADD COLUMN IF NOT EXISTS commentaire_syndic TEXT`,
    `ALTER TABLE paiements   ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE appels_fonds ADD COLUMN IF NOT EXISTS description        TEXT`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS prestataire        VARCHAR(200)`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS cout               NUMERIC(12,2)`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS urgence            VARCHAR(20) DEFAULT 'normal'`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS date_resolution    DATE`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS commentaire_syndic TEXT`,
    `ALTER TABLE incidents   ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE documents   ADD COLUMN IF NOT EXISTS taille_ko          INT`,
  ];
  for (const sql of fixes) {
    try { await query(sql); }
    catch(e) { console.warn('Schema fix skipped:', sql.substring(0,50), '-', e.message.substring(0,60)); }
  }
};

// Lancer ensureSchema au démarrage du module
ensureSchema().then(() => console.log('✅ Schema vérifié')).catch(console.error);

// Helper mise à jour robuste
const safeUpdate = async (table, sets, vals, whereId) => {
  // Essai complet
  try {
    const setClauses = sets.map((s, i) => `${s}=$${i + 1}`).join(',');
    const { rows } = await query(
      `UPDATE ${table} SET ${setClauses} WHERE id=$${sets.length + 1} RETURNING *`,
      [...vals, whereId]
    );
    return rows[0];
  } catch(e) {
    console.warn('Full update failed, trying minimal:', e.message.substring(0, 100));
  }
  // Essai minimal: statut seulement
  const statusIdx = sets.indexOf('statut');
  if (statusIdx >= 0) {
    const { rows } = await query(
      `UPDATE ${table} SET statut=$1 WHERE id=$2 RETURNING *`,
      [vals[statusIdx], whereId]
    );
    return rows[0];
  }
  throw new Error('Impossible de mettre à jour');
};

// ═══════════════════════════════════════════════════════════════
// GET /api/charges
// ═══════════════════════════════════════════════════════════════
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
  } catch(e) {
    console.error('GET /charges:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/charges — créer un appel de fonds
// ═══════════════════════════════════════════════════════════════
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, montant_base, echeance, description } = req.body;
  console.log('POST /charges:', { periode, montant_base, echeance, description, user: req.user?.id });

  if (!periode || !montant_base || !echeance)
    return res.status(400).json({ error: 'Période, montant et échéance sont requis' });

  try {
    // Créer l'appel de fonds (avec fallback sans description)
    let af;
    try {
      const { rows } = await query(
        `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,description,statut)
         VALUES ($1,$2,$3,$4,$5,'actif') RETURNING *`,
        [req.user.residence_id, periode, parseFloat(montant_base), echeance, description || '']
      );
      af = rows[0];
    } catch(e1) {
      console.warn('Insert with description failed:', e1.message, '— trying without');
      const { rows } = await query(
        `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,statut)
         VALUES ($1,$2,$3,$4,'actif') RETURNING *`,
        [req.user.residence_id, periode, parseFloat(montant_base), echeance]
      );
      af = rows[0];
    }

    // Créer les paiements pour chaque résident
    const { rows: residents } = await query(
      `SELECT id, tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );

    console.log('Résidents à facturer:', residents.length);

    for (const r of residents) {
      const m = parseFloat(montant_base) * (r.tantiemes || 0) / 1000 || parseFloat(montant_base);
      // Vérifier si le paiement existe déjà
      const { rows: ex } = await query(
        `SELECT id FROM paiements WHERE appel_id=$1 AND resident_id=$2 LIMIT 1`,
        [af.id, r.id]
      );
      if (!ex.length) {
        await query(
          `INSERT INTO paiements (appel_id,resident_id,montant,statut) VALUES ($1,$2,$3,'en_attente')`,
          [af.id, r.id, m]
        );
      }
    }

    console.log('✅ Appel de fonds créé:', af.id);
    res.status(201).json(af);
  } catch(e) {
    console.error('POST /charges ERROR:', e.message, e.stack);
    res.status(500).json({ error: 'Erreur création appel de fonds: ' + e.message });
  }
});

// GET /api/charges/resident/moi
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, a.periode, a.echeance
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/charges/paiements/:id/payer
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, date_paiement, reference } = req.body;
  console.log('POST /payer:', req.params.id, { mode, date_paiement, reference });
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paiement non trouvé' });
    if (req.user.role === 'resident' && p.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    const updated = await safeUpdate('paiements',
      ['statut', 'mode', 'date_paiement', 'reference'],
      ['declare', mode || 'virement', date_paiement || new Date().toISOString().split('T')[0], reference || null],
      req.params.id
    );

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
          html: `<p><b>${req.user.prenom} ${req.user.nom}</b> (Lot ${req.user.lot||'?'}) a déclaré un paiement de <b>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</b> pour <b>${a?.periode||'—'}</b>.</p>
                 <p>Mode: ${mode||'—'} · Date: ${date_paiement||'—'} · Réf: ${reference||'—'}</p>
                 <p><a href="${APP_URL}">Valider sur SyndicPro →</a></p>`
        });
      } catch(e) { console.warn('Email notif:', e.message); }
    });

    res.json(updated);
  } catch(e) {
    console.error('POST /payer ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/charges/paiements/:id/valider
router.post('/paiements/:id/valider', auth.gestionnaire, async (req, res) => {
  const { commentaire } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });
    const updated = await safeUpdate('paiements',
      ['statut', 'commentaire_syndic'], ['paye', commentaire || null], req.params.id
    );
    setImmediate(async () => {
      try {
        const { rows: [ri] } = await query(
          `SELECT u.email,u.prenom,a.periode FROM utilisateurs u,appels_fonds a
           WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
        );
        if (ri?.email) await sendEmail({
          to: ri.email,
          subject: `✅ Paiement validé — ${ri.periode}`,
          html: `<p>Bonjour <b>${ri.prenom}</b>, votre paiement pour <b>${ri.periode}</b> a été confirmé par le syndic.</p>
                 ${commentaire ? `<p>Message : ${commentaire}</p>` : ''}
                 <p><a href="${APP_URL}">Voir mes paiements</a></p>`
        });
      } catch(e) { console.warn('Email:', e.message); }
    });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/charges/paiements/:id/rejeter
router.post('/paiements/:id/rejeter', auth.gestionnaire, async (req, res) => {
  const { motif } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });
    const updated = await safeUpdate('paiements',
      ['statut', 'commentaire_syndic'], ['en_attente', `Rejeté : ${motif}`], req.params.id
    );
    setImmediate(async () => {
      try {
        const { rows: [ri] } = await query(
          `SELECT u.email,u.prenom,a.periode FROM utilisateurs u,appels_fonds a
           WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
        );
        if (ri?.email) await sendEmail({
          to: ri.email,
          subject: `⚠️ Déclaration rejetée — ${ri.periode}`,
          html: `<p>Bonjour <b>${ri.prenom}</b>, votre déclaration pour <b>${ri.periode}</b> a été rejetée.</p>
                 <p>Motif : ${motif}</p>
                 <p><a href="${APP_URL}">Re-déclarer</a></p>`
        });
      } catch(e) { console.warn('Email:', e.message); }
    });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/charges/paiements/:id
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1 WHERE id=$2 RETURNING *`, [req.body.statut, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
