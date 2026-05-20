const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/incidents
router.get('/', auth, async (req, res) => {
  const { statut, type } = req.query;
  let sql = `SELECT i.*,u.prenom,u.nom,u.lot FROM incidents i
             LEFT JOIN utilisateurs u ON u.id=i.resident_id
             WHERE i.residence_id=$1`;
  const params = [req.user.residence_id];
  if (req.user.role === 'resident') {
    sql += ` AND i.resident_id=$${params.length + 1}`; params.push(req.user.id);
  }
  if (statut) { sql += ` AND i.statut=$${params.length + 1}`; params.push(statut); }
  if (type)   { sql += ` AND i.type=$${params.length + 1}`; params.push(type); }
  sql += ' ORDER BY i.created_at DESC';
  try {
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/incidents
router.post('/', auth, async (req, res) => {
  const { type, localisation, description, urgence } = req.body;
  const ref = `INC-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100)}`;
  try {
    const { rows } = await query(
      `INSERT INTO incidents (residence_id,resident_id,type,localisation,description,urgence,reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.residence_id, req.user.id, type, localisation, description, urgence || 'normal', ref]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/incidents/:id
router.put('/:id', auth.gestionnaire, async (req, res) => {
  const { statut, prestataire, cout, date_resolution } = req.body;
  try {
    const { rows } = await query(
      `UPDATE incidents SET statut=$1,prestataire=$2,cout=$3,date_resolution=$4
       WHERE id=$5 AND residence_id=$6 RETURNING *`,
      [statut, prestataire, cout || null, date_resolution || null, req.params.id, req.user.residence_id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
