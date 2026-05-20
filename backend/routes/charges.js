const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/charges — liste des appels de fonds
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
         COUNT(p.id) AS nb_paiements,
         SUM(CASE WHEN p.statut='paye' THEN 1 ELSE 0 END) AS nb_payes,
         SUM(CASE WHEN p.statut IN ('retard','impaye') THEN 1 ELSE 0 END) AS nb_impayes
       FROM appels_fonds a
       LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1
       GROUP BY a.id ORDER BY a.created_at DESC`, [req.user.residence_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/charges — créer un appel de fonds
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, echeance, montant_base, description } = req.body;
  try {
    const { rows: [appel] } = await query(
      `INSERT INTO appels_fonds (residence_id,periode,echeance,montant_base,description,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.residence_id, periode, echeance, montant_base, description, req.user.id]
    );
    // Créer automatiquement les paiements pour chaque résident
    const { rows: residents } = await query(
      `SELECT id,tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for (const r of residents) {
      const montant = parseFloat(montant_base) * r.tantiemes;
      await query(
        `INSERT INTO paiements (appel_id,resident_id,montant,statut) VALUES ($1,$2,$3,'en_attente')`,
        [appel.id, r.id, montant]
      );
    }
    res.status(201).json({ ...appel, nb_paiements: residents.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/charges/:id/paiements — détail des paiements
router.get('/:id/paiements', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.tantiemes,u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1
       ORDER BY u.lot`, [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/charges/paiements/:id — mettre à jour un paiement
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  const { statut, date_paiement, mode, reference } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1,date_paiement=$2,mode=$3,reference=$4
       WHERE id=$5 RETURNING *`,
      [statut, date_paiement || null, mode, reference, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/charges/resident/moi — paiements du résident connecté
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,a.periode,a.echeance,a.description
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.created_at DESC`, [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/charges/paiements/:id/payer — payer en ligne (résident)
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, reference } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut='paye',date_paiement=CURRENT_DATE,mode=$1,reference=$2
       WHERE id=$3 AND resident_id=$4 RETURNING *`,
      [mode || 'carte', reference || `CB-${Date.now()}`, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Paiement non trouvé' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
