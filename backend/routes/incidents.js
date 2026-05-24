const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/incidents — liste selon le rôle
router.get('/', auth, async (req, res) => {
  try {
    let sql, params;
    if (req.user.role === 'resident') {
      sql = `SELECT i.*, u.prenom, u.nom, u.lot
             FROM incidents i JOIN utilisateurs u ON u.id=i.resident_id
             WHERE i.resident_id=$1 ORDER BY i.created_at DESC`;
      params = [req.user.id];
    } else {
      sql = `SELECT i.*, u.prenom, u.nom, u.lot
             FROM incidents i JOIN utilisateurs u ON u.id=i.resident_id
             WHERE i.residence_id=$1 ORDER BY i.created_at DESC`;
      params = [req.user.residence_id];
    }
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/incidents — créer
router.post('/', auth, async (req, res) => {
  const { type, localisation, description, urgence, prestataire, cout, statut } = req.body;
  if (!type) return res.status(400).json({ error: 'Type requis' });
  try {
    const { rows } = await query(
      `INSERT INTO incidents
         (residence_id, resident_id, type, localisation, description, urgence, prestataire, cout, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.residence_id, req.user.id,
        type, localisation || '', description || '',
        urgence || 'normal',
        prestataire || null,
        cout ? parseFloat(cout) : null,
        statut || 'ouvert'
      ]
    );
    res.status(201).json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur: ' + e.message }); }
});

// PUT /api/incidents/:id — modifier
router.put('/:id', auth, async (req, res) => {
  const { type, localisation, description, urgence, prestataire, cout, statut, date_resolution } = req.body;
  try {
    // Vérifier l'accès
    const { rows: [inc] } = await query(`SELECT * FROM incidents WHERE id=$1`, [req.params.id]);
    if (!inc) return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role === 'resident' && inc.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    const { rows } = await query(
      `UPDATE incidents SET
         type=COALESCE($1,type),
         localisation=COALESCE($2,localisation),
         description=COALESCE($3,description),
         urgence=COALESCE($4,urgence),
         prestataire=$5,
         cout=$6,
         statut=COALESCE($7,statut),
         date_resolution=$8,
         updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [
        type, localisation, description, urgence,
        prestataire !== undefined ? (prestataire || null) : inc.prestataire,
        cout !== undefined ? (cout ? parseFloat(cout) : null) : inc.cout,
        statut,
        date_resolution || (statut === 'resolu' ? new Date().toISOString().split('T')[0] : inc.date_resolution),
        req.params.id
      ]
    );
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/incidents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM incidents WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
