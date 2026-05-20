const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const { rows } = await query(
      `SELECT u.*, r.nom AS residence_nom FROM utilisateurs u
       JOIN residences r ON r.id = u.residence_id
       WHERE u.email = $1`, [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, role: user.role, residence_id: user.residence_id },
      JWT_SECRET, { expiresIn: '7d' }
    );

    const { password_hash, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register (gestionnaire only)
router.post('/register', async (req, res) => {
  const { email, password, prenom, nom, telephone, lot, tantiemes, role, residence_id } = req.body;
  if (!email || !password || !prenom || !nom) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await query(
      `INSERT INTO utilisateurs (residence_id,email,password_hash,prenom,nom,telephone,lot,tantiemes,role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,email,prenom,nom,role,lot`,
      [residence_id || 1, email.toLowerCase(), hash, prenom, nom, telephone, lot, tantiemes || 0, role || 'resident']
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id,u.email,u.prenom,u.nom,u.telephone,u.lot,u.tantiemes,u.role,
              u.notif_email,u.notif_sms,u.residence_id,r.nom AS residence_nom
       FROM utilisateurs u JOIN residences r ON r.id=u.residence_id
       WHERE u.id=$1`, [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/auth/me
router.put('/me', require('../middleware/auth'), async (req, res) => {
  const { prenom, nom, telephone, notif_email, notif_sms } = req.body;
  try {
    const { rows } = await query(
      `UPDATE utilisateurs SET prenom=$1,nom=$2,telephone=$3,notif_email=$4,notif_sms=$5
       WHERE id=$6 RETURNING id,email,prenom,nom,telephone,notif_email,notif_sms`,
      [prenom, nom, telephone, notif_email, notif_sms, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
