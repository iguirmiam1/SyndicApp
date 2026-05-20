const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/documents
router.get('/', auth, async (req, res) => {
  const { categorie } = req.query;
  let sql = `SELECT d.*,u.prenom||' '||u.nom AS uploaded_by_nom
             FROM documents d LEFT JOIN utilisateurs u ON u.id=d.uploaded_by
             WHERE d.residence_id=$1`;
  const params = [req.user.residence_id];
  if (categorie) { sql += ` AND d.categorie=$2`; params.push(categorie); }
  sql += ' ORDER BY d.created_at DESC';
  try {
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/documents
router.post('/', auth.gestionnaire, async (req, res) => {
  const { nom, categorie, url } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO documents (residence_id,nom,categorie,url,uploaded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.residence_id, nom, categorie, url, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/documents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM documents WHERE id=$1 AND residence_id=$2`, [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
