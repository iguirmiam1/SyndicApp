const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/ag
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
         COUNT(p.id) AS nb_presences,
         SUM(CASE WHEN p.mode='present' THEN 1 ELSE 0 END) AS nb_presents,
         SUM(CASE WHEN p.mode='correspondance' THEN 1 ELSE 0 END) AS nb_correspondance
       FROM assemblees_generales a
       LEFT JOIN presences_ag p ON p.ag_id=a.id
       WHERE a.residence_id=$1
       GROUP BY a.id ORDER BY a.date_ag DESC`, [req.user.residence_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/ag
router.post('/', auth.gestionnaire, async (req, res) => {
  const { date_ag, lieu, type, ordre_du_jour } = req.body;
  try {
    const { rows: [ag] } = await query(
      `INSERT INTO assemblees_generales (residence_id,date_ag,lieu,type,ordre_du_jour,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.residence_id, date_ag, lieu, type || 'ordinaire',
       JSON.stringify(ordre_du_jour || []), req.user.id]
    );
    // Créer les présences par défaut (absent)
    const { rows: residents } = await query(
      `SELECT id FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for (const r of residents) {
      await query(`INSERT INTO presences_ag (ag_id,resident_id,mode) VALUES ($1,$2,'absent')
                   ON CONFLICT DO NOTHING`, [ag.id, r.id]);
    }
    res.status(201).json(ag);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/ag/:id/presences
router.get('/:id/presences', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot FROM presences_ag p
       JOIN utilisateurs u ON u.id=p.resident_id WHERE p.ag_id=$1 ORDER BY u.lot`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/ag/:id/presences/:residentId
router.put('/:id/presences/:residentId', auth.gestionnaire, async (req, res) => {
  const { mode } = req.body;
  try {
    await query(
      `INSERT INTO presences_ag (ag_id,resident_id,mode) VALUES ($1,$2,$3)
       ON CONFLICT (ag_id,resident_id) DO UPDATE SET mode=$3`,
      [req.params.id, req.params.residentId, mode]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/ag/:id/votes
router.get('/:id/votes', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT resolution_num,
         SUM(CASE WHEN choix='pour' THEN 1 ELSE 0 END) AS pour,
         SUM(CASE WHEN choix='contre' THEN 1 ELSE 0 END) AS contre,
         SUM(CASE WHEN choix='abstention' THEN 1 ELSE 0 END) AS abstention
       FROM votes_ag WHERE ag_id=$1 GROUP BY resolution_num ORDER BY resolution_num`,
      [req.params.id]
    );
    // Vote du résident connecté
    const { rows: monVote } = await query(
      `SELECT resolution_num,choix FROM votes_ag WHERE ag_id=$1 AND resident_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ totaux: rows, monVote });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/ag/:id/votes
router.post('/:id/votes', auth, async (req, res) => {
  const { resolution_num, choix } = req.body;
  try {
    await query(
      `INSERT INTO votes_ag (ag_id,resident_id,resolution_num,choix) VALUES ($1,$2,$3,$4)
       ON CONFLICT (ag_id,resident_id,resolution_num) DO UPDATE SET choix=$4`,
      [req.params.id, req.user.id, resolution_num, choix]
    );
    res.json({ success: true, resolution_num, choix });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
