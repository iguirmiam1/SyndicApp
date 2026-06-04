const router = require('express').Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { query } = require('../db');

// GET /api/residents
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id,u.email,u.prenom,u.nom,u.lot,u.telephone,u.notif_email,u.notif_sms,
              u.created_at,
              p.statut AS statut_charges
       FROM utilisateurs u
       LEFT JOIN paiements p ON p.resident_id=u.id
         AND p.appel_id=(SELECT id FROM appels_fonds WHERE residence_id=u.residence_id AND statut='actif' ORDER BY created_at DESC LIMIT 1)
       WHERE u.residence_id=$1 AND u.role='resident'
       ORDER BY u.lot, u.nom`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/residents — créer un résident
router.post('/', auth.gestionnaire, async (req, res) => {
  const { prenom, nom, email, telephone, lot, password } = req.body;
  if (!prenom || !nom || !email)
    return res.status(400).json({ error: 'Prénom, nom et email sont requis' });
  try {
    // Vérifier si email déjà utilisé
    const { rows: existing } = await query(
      `SELECT id FROM utilisateurs WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]
    );
    if (existing.length)
      return res.status(409).json({ error: 'Cet email est déjà utilisé pour un autre compte.' });

    const pwd = password || 'Resident2026!';
    const hash = await bcrypt.hash(pwd, 10);
    const { rows } = await query(
      `INSERT INTO utilisateurs (residence_id,email,password_hash,prenom,nom,telephone,lot,role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'resident') RETURNING id,email,prenom,nom,lot,telephone`,
      [req.user.residence_id, email.toLowerCase(), hash, prenom, nom, telephone || null, lot || null]
    );
    res.status(201).json({ ...rows[0], _password: pwd });
  } catch(e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé.' });
    console.error('POST /residents:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/residents/:id — modifier
router.put('/:id', auth.gestionnaire, async (req, res) => {
  const { prenom, nom, email, telephone, lot } = req.body;
  try {
    const { rows } = await query(
      `UPDATE utilisateurs SET prenom=$1,nom=$2,email=$3,telephone=$4,lot=$5
       WHERE id=$6 AND residence_id=$7 AND role='resident' RETURNING id,email,prenom,nom,lot,telephone`,
      [prenom, nom, email?.toLowerCase(), telephone || null, lot || null, req.params.id, req.user.residence_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Résident non trouvé' });
    res.json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé.' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/residents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM utilisateurs WHERE id=$1 AND residence_id=$2 AND role='resident'`,
      [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Impossible de supprimer ce résident' }); }
});

module.exports = router;
