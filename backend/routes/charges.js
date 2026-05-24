const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/charges — appels de fonds
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, COUNT(p.id) AS nb_paiements,
              SUM(CASE WHEN p.statut='paye' THEN p.montant ELSE 0 END) AS total_encaisse
       FROM appels_fonds a LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/charges — créer un appel de fonds
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, montant_base, echeance, description } = req.body;
  if (!periode || !montant_base || !echeance)
    return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    // Créer l'appel de fonds
    const { rows: [af] } = await query(
      `INSERT INTO appels_fonds (residence_id, periode, montant_base, echeance, description, statut)
       VALUES ($1,$2,$3,$4,$5,'actif') RETURNING *`,
      [req.user.residence_id, periode, parseFloat(montant_base), echeance, description || '']
    );
    // Créer automatiquement les paiements pour chaque résident
    const { rows: residents } = await query(
      `SELECT id, tantiemes FROM utilisateurs
       WHERE residence_id=$1 AND role='resident'`, [req.user.residence_id]
    );
    for (const r of residents) {
      const montant = parseFloat(montant_base) * (r.tantiemes || 0) / 1000 || parseFloat(montant_base);
      await query(
        `INSERT INTO paiements (appel_id, resident_id, montant, statut)
         VALUES ($1,$2,$3,'en_attente') ON CONFLICT DO NOTHING`,
        [af.id, r.id, montant]
      );
    }
    res.status(201).json(af);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/charges/resident/moi — paiements du résident connecté
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, a.periode, a.echeance, a.description, a.statut AS statut_appel
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/charges/:id/paiements — détail des paiements d'un appel
router.get('/:id/paiements', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.prenom, u.nom, u.lot, u.tantiemes, u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1 ORDER BY p.statut, u.nom`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/charges/paiements/:id/payer — déclarer un paiement (résident ou gestionnaire)
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, date_paiement, reference } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paiement non trouvé' });
    // Résident : ne peut payer que son propre paiement
    if (req.user.role === 'resident' && p.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    const { rows: [updated] } = await query(
      `UPDATE paiements SET
         statut='paye',
         mode=$1,
         date_paiement=$2,
         reference=$3,
         updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [
        mode || 'virement',
        date_paiement || new Date().toISOString().split('T')[0],
        reference || null,
        req.params.id
      ]
    );
    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/charges/paiements/:id — modifier statut (gestionnaire)
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  const { statut, mode, date_paiement, reference } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1, mode=$2, date_paiement=$3, reference=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [statut, mode || null, date_paiement || null, reference || null, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
