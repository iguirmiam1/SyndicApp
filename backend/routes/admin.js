const router = require('express').Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { query } = require('../db');

const isAdmin = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
    next();
  });
};

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const [users, residences, incidents, charges, notifs] = await Promise.all([
      query(`SELECT role, COUNT(*) as cnt FROM utilisateurs GROUP BY role`),
      query(`SELECT COUNT(*) as cnt FROM residences`),
      query(`SELECT statut, COUNT(*) as cnt FROM incidents GROUP BY statut`),
      query(`SELECT statut, COUNT(*) as cnt FROM appels_fonds GROUP BY statut`),
      query(`SELECT COUNT(*) as cnt FROM notifications_log WHERE created_at > NOW()-INTERVAL '30 days'`),
    ]);
    const userStats = {}; users.rows.forEach(r => { userStats[r.role] = +r.cnt; });
    const incStats = {}; incidents.rows.forEach(r => { incStats[r.statut] = +r.cnt; });
    res.json({
      totalUsers: users.rows.reduce((s,r) => s + +r.cnt, 0), userStats,
      totalResidences: +residences.rows[0]?.cnt || 0, incStats,
      totalCharges: charges.rows.reduce((s,r) => s + +r.cnt, 0),
      notifsMois: +notifs.rows[0]?.cnt || 0,
    });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id,u.email,u.prenom,u.nom,u.role,u.lot,u.tantiemes,u.telephone,u.created_at,r.nom AS residence_nom
       FROM utilisateurs u LEFT JOIN residences r ON r.id=u.residence_id ORDER BY u.role,u.nom`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/users', isAdmin, async (req, res) => {
  const { email, password, prenom, nom, telephone, lot, tantiemes, role, residence_id } = req.body;
  if (!email || !password || !prenom || !nom || !role) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO utilisateurs (residence_id,email,password_hash,prenom,nom,telephone,lot,tantiemes,role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,email,prenom,nom,role,lot,tantiemes,telephone`,
      [residence_id || 1, email.toLowerCase(), hash, prenom, nom, telephone, lot, tantiemes || 0, role]
    );
    res.status(201).json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/users/:id', isAdmin, async (req, res) => {
  const { prenom, nom, email, telephone, lot, tantiemes, role, password, residence_id } = req.body;
  try {
    let pwClause = ''; const params = [prenom,nom,email,telephone,lot,tantiemes||0,role,residence_id||1,req.params.id];
    if (password) { const h = await bcrypt.hash(password, 10); pwClause = `,password_hash=$${params.length+1}`; params.push(h); }
    const { rows } = await query(
      `UPDATE utilisateurs SET prenom=$1,nom=$2,email=$3,telephone=$4,lot=$5,tantiemes=$6,role=$7,residence_id=$8${pwClause}
       WHERE id=$9 RETURNING id,email,prenom,nom,role,lot,tantiemes,telephone`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Non trouvé' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    const { rows } = await query(`SELECT role FROM utilisateurs WHERE id=$1`,[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Non trouvé' });
    if (rows[0].role === 'admin') return res.status(403).json({ error: 'Impossible de supprimer un admin' });
    await query(`DELETE FROM utilisateurs WHERE id=$1`,[req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/users/:id/role', isAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['resident','gestionnaire','admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  try {
    const { rows } = await query(`UPDATE utilisateurs SET role=$1 WHERE id=$2 RETURNING id,email,prenom,nom,role`,[role,req.params.id]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── TYPES CHARGES ─────────────────────────────────────────────────────────────
router.get('/types-charges', isAdmin, async (req, res) => {
  try {
    const { rows } = await query(`SELECT t.*,r.nom AS residence_nom FROM types_charges t LEFT JOIN residences r ON r.id=t.residence_id ORDER BY t.actif DESC,t.nom`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.post('/types-charges', isAdmin, async (req, res) => {
  const { nom, description, residence_id } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try { const { rows } = await query(`INSERT INTO types_charges (residence_id,nom,description) VALUES ($1,$2,$3) RETURNING *`,[residence_id||1,nom,description]); res.status(201).json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.put('/types-charges/:id', isAdmin, async (req, res) => {
  const { nom, description, actif } = req.body;
  try { const { rows } = await query(`UPDATE types_charges SET nom=$1,description=$2,actif=$3 WHERE id=$4 RETURNING *`,[nom,description,actif??true,req.params.id]); res.json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.delete('/types-charges/:id', isAdmin, async (req, res) => {
  try { await query(`DELETE FROM types_charges WHERE id=$1`,[req.params.id]); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── TYPES DÉPENSES ────────────────────────────────────────────────────────────
router.get('/types-depenses', isAdmin, async (req, res) => {
  try { const { rows } = await query(`SELECT t.*,r.nom AS residence_nom FROM types_depenses t LEFT JOIN residences r ON r.id=t.residence_id ORDER BY t.categorie,t.nom`); res.json(rows); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.post('/types-depenses', isAdmin, async (req, res) => {
  const { nom, description, categorie, residence_id } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try { const { rows } = await query(`INSERT INTO types_depenses (residence_id,nom,description,categorie) VALUES ($1,$2,$3,$4) RETURNING *`,[residence_id||1,nom,description,categorie||'general']); res.status(201).json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.put('/types-depenses/:id', isAdmin, async (req, res) => {
  const { nom, description, categorie, actif } = req.body;
  try { const { rows } = await query(`UPDATE types_depenses SET nom=$1,description=$2,categorie=$3,actif=$4 WHERE id=$5 RETURNING *`,[nom,description,categorie||'general',actif??true,req.params.id]); res.json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.delete('/types-depenses/:id', isAdmin, async (req, res) => {
  try { await query(`DELETE FROM types_depenses WHERE id=$1`,[req.params.id]); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── TYPES RÉCLAMATIONS ────────────────────────────────────────────────────────
router.get('/types-reclamations', isAdmin, async (req, res) => {
  try { const { rows } = await query(`SELECT t.*,r.nom AS residence_nom FROM types_reclamations t LEFT JOIN residences r ON r.id=t.residence_id ORDER BY t.priorite DESC,t.nom`); res.json(rows); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.post('/types-reclamations', isAdmin, async (req, res) => {
  const { nom, description, priorite, delai_traitement_jours, residence_id } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try { const { rows } = await query(`INSERT INTO types_reclamations (residence_id,nom,description,priorite,delai_traitement_jours) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[residence_id||1,nom,description,priorite||'normale',delai_traitement_jours||7]); res.status(201).json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.put('/types-reclamations/:id', isAdmin, async (req, res) => {
  const { nom, description, priorite, delai_traitement_jours, actif } = req.body;
  try { const { rows } = await query(`UPDATE types_reclamations SET nom=$1,description=$2,priorite=$3,delai_traitement_jours=$4,actif=$5 WHERE id=$6 RETURNING *`,[nom,description,priorite||'normale',delai_traitement_jours||7,actif??true,req.params.id]); res.json(rows[0]); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
router.delete('/types-reclamations/:id', isAdmin, async (req, res) => {
  try { await query(`DELETE FROM types_reclamations WHERE id=$1`,[req.params.id]); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── RÉSIDENCES ────────────────────────────────────────────────────────────────
router.get('/residences', isAdmin, async (req, res) => {
  try {
    const { rows } = await query(`SELECT r.*,COUNT(u.id) AS nb_utilisateurs FROM residences r LEFT JOIN utilisateurs u ON u.residence_id=r.id GROUP BY r.id ORDER BY r.nom`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
