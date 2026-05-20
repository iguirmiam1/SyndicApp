const router = require('express').Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { query } = require('../db');

// GET /api/residents
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id,u.prenom,u.nom,u.email,u.telephone,u.lot,u.tantiemes,u.role,u.created_at,
              p.statut AS statut_charges
       FROM utilisateurs u
       LEFT JOIN paiements p ON p.resident_id=u.id
         AND p.appel_id=(SELECT id FROM appels_fonds WHERE residence_id=u.residence_id AND statut='actif' ORDER BY created_at DESC LIMIT 1)
       WHERE u.residence_id=$1 AND u.role='resident'
       ORDER BY u.lot`, [req.user.residence_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/residents/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id,prenom,nom,email,telephone,lot,tantiemes,role,notif_email,notif_sms,created_at
       FROM utilisateurs WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Résident non trouvé' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/residents
router.post('/', auth.gestionnaire, async (req, res) => {
  const { prenom, nom, email, telephone, lot, tantiemes, role, password } = req.body;
  try {
    const hash = await bcrypt.hash(password || 'resident123', 10);
    const { rows } = await query(
      `INSERT INTO utilisateurs (residence_id,email,password_hash,prenom,nom,telephone,lot,tantiemes,role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,email,prenom,nom,lot,tantiemes,role`,
      [req.user.residence_id, email, hash, prenom, nom, telephone, lot, tantiemes || 0, role || 'resident']
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/residents/:id
router.put('/:id', auth.gestionnaire, async (req, res) => {
  const { prenom, nom, telephone, lot, tantiemes } = req.body;
  try {
    const { rows } = await query(
      `UPDATE utilisateurs SET prenom=$1,nom=$2,telephone=$3,lot=$4,tantiemes=$5
       WHERE id=$6 AND residence_id=$7 RETURNING id,prenom,nom,telephone,lot,tantiemes`,
      [prenom, nom, telephone, lot, tantiemes, req.params.id, req.user.residence_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Non trouvé' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/residents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM utilisateurs WHERE id=$1 AND residence_id=$2 AND role='resident'`,
      [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
