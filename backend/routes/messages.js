const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/messages?canal=syndic|forum
router.get('/', auth, async (req, res) => {
  const { canal = 'syndic' } = req.query;
  try {
    const { rows } = await query(
      `SELECT m.*,u.prenom,u.nom,u.role,u.lot
       FROM messages m JOIN utilisateurs u ON u.id=m.expediteur_id
       WHERE m.residence_id=$1 AND m.canal=$2
       ORDER BY m.created_at ASC LIMIT 100`,
      [req.user.residence_id, canal]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/messages
router.post('/', auth, async (req, res) => {
  const { canal, contenu } = req.body;
  if (!contenu?.trim()) return res.status(400).json({ error: 'Message vide' });
  try {
    const { rows } = await query(
      `INSERT INTO messages (residence_id,expediteur_id,canal,contenu)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.residence_id, req.user.id, canal || 'syndic', contenu.trim()]
    );
    const { rows: [full] } = await query(
      `SELECT m.*,u.prenom,u.nom,u.role,u.lot
       FROM messages m JOIN utilisateurs u ON u.id=m.expediteur_id
       WHERE m.id=$1`, [rows[0].id]
    );
    res.status(201).json(full);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
