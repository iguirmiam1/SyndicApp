const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/messages?canal=syndic|forum
router.get('/', auth, async (req, res) => {
  const { canal } = req.query;
  try {
    let sql, params;
    if (req.user.role === 'gestionnaire' || req.user.role === 'admin') {
      // Gestionnaire voit tous les messages du canal dans sa résidence
      sql = `SELECT m.*, u.prenom, u.nom, u.role, u.lot
             FROM messages m JOIN utilisateurs u ON u.id=m.expediteur_id
             WHERE m.residence_id=$1 ${canal ? 'AND m.canal=$2' : ''}
             ORDER BY m.created_at ASC LIMIT 200`;
      params = canal ? [req.user.residence_id, canal] : [req.user.residence_id];
    } else {
      // Résident : voir les messages du canal
      sql = `SELECT m.*, u.prenom, u.nom, u.role, u.lot
             FROM messages m JOIN utilisateurs u ON u.id=m.expediteur_id
             WHERE m.residence_id=$1 ${canal ? 'AND m.canal=$2' : ''}
             ORDER BY m.created_at ASC LIMIT 100`;
      params = canal ? [req.user.residence_id, canal] : [req.user.residence_id];
    }
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/messages/conversations — résumé des conversations pour le gestionnaire
router.get('/conversations', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT ON (u.id) u.id AS resident_id, u.prenom, u.nom, u.lot,
              m.contenu AS dernier_message, m.created_at AS date_dernier,
              COUNT(m2.id) FILTER (WHERE m2.lu=false AND m2.expediteur_id=u.id) AS non_lus
       FROM utilisateurs u
       JOIN messages m ON m.expediteur_id=u.id AND m.canal='syndic'
       LEFT JOIN messages m2 ON m2.residence_id=u.residence_id AND m2.canal='syndic'
       WHERE u.residence_id=$1 AND u.role='resident'
       GROUP BY u.id, u.prenom, u.nom, u.lot, m.contenu, m.created_at
       ORDER BY u.id, m.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { 
    // Si la colonne 'lu' n'existe pas, fallback simple
    const { rows: fallback } = await query(
      `SELECT DISTINCT u.id AS resident_id, u.prenom, u.nom, u.lot
       FROM utilisateurs u
       JOIN messages m ON (m.expediteur_id=u.id OR m.destinataire_id=u.id)
       WHERE u.residence_id=$1 AND u.role='resident' AND m.canal='syndic'`,
      [req.user.residence_id]
    ).catch(() => ({ rows: [] }));
    res.json(fallback);
  }
});

// POST /api/messages — envoyer un message
router.post('/', auth, async (req, res) => {
  const { canal, contenu, destinataire_id } = req.body;
  if (!canal || !contenu?.trim())
    return res.status(400).json({ error: 'Canal et contenu requis' });
  try {
    const { rows } = await query(
      `INSERT INTO messages (residence_id, expediteur_id, canal, contenu, destinataire_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.residence_id, req.user.id, canal, contenu.trim(), destinataire_id || null]
    );
    res.status(201).json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/messages/:id — supprimer (gestionnaire ou auteur)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows: [msg] } = await query(`SELECT * FROM messages WHERE id=$1`, [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    if (req.user.role !== 'gestionnaire' && req.user.role !== 'admin' && msg.expediteur_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });
    await query(`DELETE FROM messages WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
